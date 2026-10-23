import type { GameCtx } from "./context";
import { fail, type Result } from "./errors";
import { guardPlayer, guardPlaying } from "./guards";
import { cellKey, solutionLetter } from "./puzzle";
import { metaPoints } from "./score";
import { cloneState, lockedCellKeys } from "./state";
import type { RoomState } from "./types";

export function normalizeGuess(guess: string): string {
  return guess.toUpperCase().replace(/[^A-Z]/g, "");
}

/**
 * Meta guess (§3.10, revised): one guess is compared with every unsolved meta word. A match
 * solves that word and records how many rotations had been made; a miss costs one of the team's
 * shared wrong guesses. Guessing an already-solved word costs nothing.
 */
export function guessMeta(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  guess: string,
  now: number,
): Result<{
  state: RoomState;
  correct: boolean;
  metaId: string | null;
  points: number | null;
  guessesLeft: number;
}> {
  const g = guardPlayer(state, pid) ?? guardPlaying(state);
  if (g) return g;
  const normalized = normalizeGuess(guess);
  if (normalized === "") return fail("BAD_REQUEST", "Enter a guess.");
  const ids = ctx.puzzle.metas.map((m) => m.id);
  const match = ids.find((id) => normalizeGuess(ctx.solution.metaAnswers[id] ?? "") === normalized);
  if (match && state.metaSolved[match]) {
    const solved = state.metaSolved[match];
    return {
      ok: true,
      state,
      correct: true,
      metaId: match,
      points: metaPoints(solved.rotations, ctx.cfg),
      guessesLeft: state.metaGuessesLeft,
    };
  }
  if (ids.every((id) => state.metaSolved[id]))
    return fail("BAD_REQUEST", "Every meta word is solved.");
  if (state.metaGuessesLeft <= 0) return fail("NO_GUESSES", "No meta guesses left.");
  const next = cloneState(state);
  if (match) {
    next.metaSolved[match] = { at: now, rotations: next.rotations };
    return {
      ok: true,
      state: next,
      correct: true,
      metaId: match,
      points: metaPoints(next.rotations, ctx.cfg),
      guessesLeft: next.metaGuessesLeft,
    };
  }
  next.metaGuessesLeft -= 1;
  next.stats.metaWrong += 1;
  return {
    ok: true,
    state: next,
    correct: false,
    metaId: null,
    points: null,
    guessesLeft: next.metaGuessesLeft,
  };
}

export type MetaSlot = { emoji: string; boardIndex: number; letter: string | null };

export type MetaWordState = {
  id: string;
  enumeration: string;
  slots: MetaSlot[];
  /** Solved by a correct guess. */
  solved: boolean;
  /** Revealed by finishing the puzzle without a correct guess (scores nothing). */
  autoCompleted: boolean;
  /** Present once solved or revealed. */
  answer?: string;
  rotations?: number;
  points?: number;
};

/**
 * Meta words for display. A slot shows its letter once a word containing that cell is locked;
 * a solved word, or any word once the game has ended, shows every letter.
 */
export function metaWords(state: RoomState, ctx: GameCtx): MetaWordState[] {
  const lockedByBoard = ctx.puzzle.boards.map((_, bi) => lockedCellKeys(state, ctx, bi));
  return ctx.puzzle.metas.map((m) => {
    const solve = state.metaSolved[m.id];
    const revealAll = Boolean(solve) || state.status === "ended";
    const word: MetaWordState = {
      id: m.id,
      enumeration: m.enumeration,
      slots: m.cells.map(([b, r, c]) => ({
        emoji: state.boardEmojis[b]?.e ?? "",
        boardIndex: b,
        letter:
          revealAll || lockedByBoard[b].has(cellKey(r, c))
            ? solutionLetter(ctx.solution, b, r, c)
            : null,
      })),
      solved: Boolean(solve),
      autoCompleted: !solve && state.status === "ended",
    };
    if (revealAll) word.answer = ctx.solution.metaAnswers[m.id];
    if (solve) {
      word.rotations = solve.rotations;
      word.points = metaPoints(solve.rotations, ctx.cfg);
    }
    return word;
  });
}
