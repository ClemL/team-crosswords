import type { GameCtx } from "./context";
import { fail, type Result } from "./errors";
import { guardBoardAtSeat, guardInGame, guardPlayer, guardPlaying } from "./guards";
import { cellKey, isOpen } from "./puzzle";
import { cloneState, isCellLocked, statsFor } from "./state";
import type { RoomState } from "./types";

/** Type or clear one cell (§3.3). `letter` is A–Z (case-insensitive) or "" to clear. */
export function applyEntry(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  board: number,
  r: number,
  c: number,
  letter: string,
  now: number,
): Result<{ state: RoomState }> {
  const g =
    guardPlayer(state, pid) ??
    guardPlaying(state) ??
    guardInGame(state, pid) ??
    guardBoardAtSeat(state, pid, board, now);
  if (g) return g;
  const pb = ctx.puzzle.boards[board];
  if (!pb || !isOpen(pb, r, c)) return fail("BAD_REQUEST", "That cell cannot be selected.");
  const value = letter.toUpperCase();
  if (value !== "" && !/^[A-Z]$/.test(value)) return fail("BAD_REQUEST", "Letters must be A–Z.");
  const key = cellKey(r, c);
  if (isCellLocked(state, ctx, board, key)) return fail("LOCKED_CELL", "That cell is locked.");

  const current = state.boards[board].entries[key] ?? "";
  if (current === value) return { ok: true, state };
  const next = cloneState(state);
  const b = next.boards[board];
  if (value === "") {
    delete b.entries[key];
    delete b.authors[key];
  } else {
    b.entries[key] = value;
    // The typist gets the tile credit if this letter is still there when the cell locks.
    b.authors[key] = pid;
    statsFor(next, pid).lettersTyped += 1;
  }
  return { ok: true, state: next };
}
