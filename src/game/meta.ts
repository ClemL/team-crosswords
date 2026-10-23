import type { GameCtx } from "./context";
import { endGameIfComplete } from "./end";
import { fail, type Result } from "./errors";
import { guardPlayer, guardPlaying } from "./guards";
import { cellKey, solutionLetter } from "./puzzle";
import { metaPoints } from "./score";
import { cloneState, lockedCellKeys, statsFor } from "./state";
import type { RoomState } from "./types";

export function normalizeGuess(guess: string): string {
  return guess.toUpperCase().replace(/[^A-Z]/g, "");
}

/** Whether the player still has their single meta guess. */
export function hasGuessLeft(state: RoomState, pid: string): boolean {
  return !state.playerStats[pid]?.guess;
}

/**
 * Meta guess (revised §3.10): each player gets exactly one guess per game, checked against every
 * meta word not yet obtained. Right or wrong, it is used up. A correct guess obtains the word at
 * the current rotation count. Obtaining the last word ends the game.
 */
export function guessMeta(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  guess: string,
  now: number,
): Result<{ state: RoomState; correct: boolean; metaId: string | null; points: number | null }> {
  const g = guardPlayer(state, pid) ?? guardPlaying(state);
  if (g) return g;
  if (!hasGuessLeft(state, pid)) return fail("NO_GUESSES", "You have already used your guess.");
  const normalized = normalizeGuess(guess);
  if (normalized === "") return fail("BAD_REQUEST", "Enter a guess.");
  const match = ctx.puzzle.metas
    .map((m) => m.id)
    .find((id) => normalizeGuess(ctx.solution.metaAnswers[id] ?? "") === normalized);
  // A word that is already obtained is fully shown, so guessing it would waste the guess.
  if (match && state.metaSolved[match]) return fail("BAD_REQUEST", "That word is already solved.");
  const next = cloneState(state);
  statsFor(next, pid).guess = {
    text: normalized,
    metaId: match ?? null,
    at: now,
    rotations: next.rotations,
  };
  if (!match) {
    next.stats.metaWrong += 1;
    return { ok: true, state: next, correct: false, metaId: null, points: null };
  }
  next.metaSolved[match] = {
    at: now,
    rotations: next.rotations,
    by: "guess",
    seat: next.players[pid].seat,
  };
  endGameIfComplete(next, ctx, now);
  return {
    ok: true,
    state: next,
    correct: true,
    metaId: match,
    points: metaPoints(next.rotations, ctx.cfg),
  };
}

export type MetaSlot = { emoji: string; boardIndex: number; letter: string | null };

export type MetaWordState = {
  id: string;
  enumeration: string;
  slots: MetaSlot[];
  /** Obtained, by a guess or by all of its tiles locking. */
  solved: boolean;
  by: "guess" | "tiles" | null;
  /** Present once obtained. */
  answer?: string;
  rotations?: number;
  points?: number;
  /** Name of the player whose guess obtained it. */
  guessedBy?: string;
};

/**
 * Meta words for display. A slot shows its letter once a word containing that cell is locked;
 * an obtained word shows every letter and its answer.
 */
export function metaWords(state: RoomState, ctx: GameCtx): MetaWordState[] {
  const lockedByBoard = ctx.puzzle.boards.map((_, bi) => lockedCellKeys(state, ctx, bi));
  const nameAtSeat = new Map(Object.values(state.players).map((p) => [p.seat, p.name]));
  return ctx.puzzle.metas.map((m) => {
    const got = state.metaSolved[m.id];
    const word: MetaWordState = {
      id: m.id,
      enumeration: m.enumeration,
      slots: m.cells.map(([b, r, c]) => ({
        emoji: state.boardEmojis[b]?.e ?? "",
        boardIndex: b,
        letter:
          got || lockedByBoard[b].has(cellKey(r, c)) ? solutionLetter(ctx.solution, b, r, c) : null,
      })),
      solved: Boolean(got),
      by: got?.by ?? null,
    };
    if (got) {
      word.answer = ctx.solution.metaAnswers[m.id];
      word.rotations = got.rotations;
      word.points = metaPoints(got.rotations, ctx.cfg);
      if (got.by === "guess" && got.seat !== undefined) word.guessedBy = nameAtSeat.get(got.seat);
    }
    return word;
  });
}
