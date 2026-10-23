import type { GameCtx } from "./context";
import { endGameIfComplete } from "./end";
import { fail, type Result } from "./errors";
import { guardBoardAtSeat, guardPlayer, guardPlaying } from "./guards";
import { cellKey, indexPuzzle } from "./puzzle";
import { cloneState, isWordFilled, lockWord, wrongCells } from "./state";
import type { Cell, RoomState } from "./types";

/**
 * Check Cells (§3.8): spend one token on a filled, pending word. Wrong cells turn red; a fully
 * correct word locks immediately. Rejected calls never spend a token.
 */
export function checkCells(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  board: number,
  clueId: string,
  now: number,
): Result<{ state: RoomState; wrong: Cell[]; locked: boolean }> {
  const g =
    guardPlayer(state, pid) ?? guardPlaying(state) ?? guardBoardAtSeat(state, pid, board, now);
  if (g) return g;
  const clue = indexPuzzle(ctx.puzzle).boards[board]?.clueById.get(clueId);
  if (!clue) return fail("BAD_REQUEST", "That clue is not on this board.");
  if (state.locked.includes(clueId)) return fail("LOCKED_CELL", "That word is already locked.");
  if (!isWordFilled(state, board, clue))
    return fail("NOT_FILLED", "Fill every cell of the word first.");
  if (state.tokensLeft <= 0) return fail("NO_TOKENS", "No Check tokens left.");

  const next = cloneState(state);
  next.tokensLeft -= 1;
  next.stats.tokensSpent += 1;
  const wrong = wrongCells(next, ctx, board, clue);
  if (wrong.length === 0) {
    lockWord(next, board, clue);
    endGameIfComplete(next, ctx, now);
    return { ok: true, state: next, wrong: [], locked: true };
  }
  const red = new Set(next.boards[board].red);
  for (const [r, c] of wrong) red.add(cellKey(r, c));
  next.boards[board].red = [...red];
  return { ok: true, state: next, wrong, locked: false };
}
