import type { GameCtx } from "./context";
import { endGameIfComplete } from "./end";
import { cellKey, solutionLetter } from "./puzzle";
import { cloneState, isWordCorrect, isWordFilled, lockWord } from "./state";
import type { PublicClue, RoomState } from "./types";

export type PulseResult = {
  state: RoomState;
  newlyLocked: string[];
  newlyUnlocked: string[];
  ended: boolean;
};

/** Whether a clue's unlock condition holds for the given state (§3.5). */
export function unlockConditionMet(state: RoomState, ctx: GameCtx, clue: PublicClue): boolean {
  const u = clue.unlock;
  switch (u.type) {
    case "base":
      return true;
    case "crossLetter": {
      const [r, c] = u.cell;
      const entry = state.boards[u.board]?.entries[cellKey(r, c)];
      return (
        entry !== undefined && entry !== "" && entry === solutionLetter(ctx.solution, u.board, r, c)
      );
    }
    case "rotations":
      return state.rotations >= u.atLeast;
    case "solvedCount":
      return state.locked.length >= u.atLeast;
  }
}

/**
 * Validation pulse (§3.4, §3.5.3):
 * (a) lock every filled word whose letters all match the solution,
 * (b) evaluate unlocks on the post-lock state, (c) evaluate once more for cascades,
 * (d) percentages and the meta bar are derived from `locked`, so they are current afterwards.
 * Also ends the game when every word is locked.
 */
export function runPulse(state: RoomState, ctx: GameCtx, now: number): PulseResult {
  const next = cloneState(state);
  const newlyLocked: string[] = [];
  ctx.puzzle.boards.forEach((board, bi) => {
    for (const clue of board.clues) {
      if (next.locked.includes(clue.id)) continue;
      if (isWordFilled(next, bi, clue) && isWordCorrect(next, ctx, bi, clue)) {
        lockWord(next, bi, clue);
        newlyLocked.push(clue.id);
      }
    }
  });

  const newlyUnlocked: string[] = [];
  for (let pass = 0; pass < 2; pass++) {
    for (const board of ctx.puzzle.boards) {
      for (const clue of board.clues) {
        if (next.unlocked.includes(clue.id)) continue;
        if (unlockConditionMet(next, ctx, clue)) {
          next.unlocked.push(clue.id);
          newlyUnlocked.push(clue.id);
        }
      }
    }
  }

  const ended = endGameIfComplete(next, ctx, now);
  return { state: next, newlyLocked, newlyUnlocked, ended };
}
