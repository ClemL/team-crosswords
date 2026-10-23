import type { GameCtx } from "./context";
import { fail, type Result } from "./errors";
import { guardBoardAtSeat, guardInGame, guardPlayer, guardPlaying } from "./guards";
import { cellKey, isOpen, solutionLetter } from "./puzzle";
import { cloneState, isCellLocked, statsFor } from "./state";
import type { RoomState } from "./types";

/**
 * Suspect marks (§3.9). Marking a cell that holds the correct letter at that moment counts as a
 * false suspect; marking an empty cell never does.
 */
export function toggleSuspect(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  board: number,
  r: number,
  c: number,
  on: boolean,
  now: number,
): Result<{ state: RoomState; falseSuspect: boolean }> {
  const g =
    guardPlayer(state, pid) ??
    guardPlaying(state) ??
    guardInGame(state, pid) ??
    guardBoardAtSeat(state, pid, board, now);
  if (g) return g;
  const pb = ctx.puzzle.boards[board];
  if (!pb || !isOpen(pb, r, c)) return fail("BAD_REQUEST", "That cell cannot be selected.");
  const key = cellKey(r, c);
  if (isCellLocked(state, ctx, board, key)) return fail("LOCKED_CELL", "That cell is locked.");

  const marked = state.boards[board].suspects[key] !== undefined;
  if (on === marked) return { ok: true, state, falseSuspect: false };
  const next = cloneState(state);
  const b = next.boards[board];
  if (!on) {
    delete b.suspects[key];
    return { ok: true, state: next, falseSuspect: false };
  }
  b.suspects[key] = pid;
  const entry = b.entries[key] ?? "";
  const falseSuspect = entry !== "" && entry === solutionLetter(ctx.solution, board, r, c);
  const mine = statsFor(next, pid);
  if (falseSuspect) {
    next.stats.falseSuspects += 1;
    mine.falseSuspects += 1;
  } else if (entry !== "") {
    next.stats.accurateSuspects += 1;
    mine.accurateSuspects += 1;
  }
  return { ok: true, state: next, falseSuspect };
}
