import type { GameCtx } from "./context";
import { fail, type Result } from "./errors";
import { guardPlayer, guardPlaying } from "./guards";
import { cellKey, solutionLetter } from "./puzzle";
import { cloneState, lockedCellKeys } from "./state";
import type { RoomState } from "./types";

export function normalizeGuess(guess: string): string {
  return guess.toUpperCase().replace(/[^A-Z]/g, "");
}

/** Meta guess (§3.10): 3 wrong guesses per team, compared after normalization. */
export function guessMeta(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  guess: string,
  now: number,
): Result<{ state: RoomState; correct: boolean; guessesLeft: number }> {
  const g = guardPlayer(state, pid) ?? guardPlaying(state);
  if (g) return g;
  if (state.metaSolvedAt !== null) {
    return { ok: true, state, correct: true, guessesLeft: state.metaGuessesLeft };
  }
  if (state.metaGuessesLeft <= 0) return fail("NO_GUESSES", "No meta guesses left.");
  const normalized = normalizeGuess(guess);
  if (normalized === "") return fail("BAD_REQUEST", "Enter a guess.");
  const next = cloneState(state);
  const correct = normalized === normalizeGuess(ctx.solution.metaAnswer);
  if (correct) {
    next.metaSolvedAt = now;
  } else {
    next.metaGuessesLeft -= 1;
    next.stats.metaWrong += 1;
  }
  return { ok: true, state: next, correct, guessesLeft: next.metaGuessesLeft };
}

export type MetaSlot = { emoji: string; boardIndex: number; letter: string | null };

/** Meta bar (§3.10.2): a slot shows its letter once a word containing that cell is locked. */
export function metaSlots(state: RoomState, ctx: GameCtx): MetaSlot[] {
  return ctx.puzzle.boards.flatMap((board, bi) => {
    const locked = lockedCellKeys(state, ctx, bi);
    return board.shaded.map(([r, c]) => ({
      emoji: state.boardEmojis[bi]?.e ?? "",
      boardIndex: bi,
      letter: locked.has(cellKey(r, c)) ? solutionLetter(ctx.solution, bi, r, c) : null,
    }));
  });
}
