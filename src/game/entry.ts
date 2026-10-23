import type { GameCtx } from "./context";
import { fail, type Result } from "./errors";
import { guardBoardAtSeat, guardPlayer, guardPlaying } from "./guards";
import { cellKey, isOpen } from "./puzzle";
import { cloneState, isCellLocked } from "./state";
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
    guardPlayer(state, pid) ?? guardPlaying(state) ?? guardBoardAtSeat(state, pid, board, now);
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
  if (value === "") delete b.entries[key];
  else b.entries[key] = value;
  // §3.8.2: a red mark clears when its cell is edited.
  b.red = b.red.filter((k) => k !== key);
  return { ok: true, state: next };
}
