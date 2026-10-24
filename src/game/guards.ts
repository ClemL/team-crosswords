import { fail, type GameError } from "./errors";
import type { RoomState } from "./types";

type Failure = { ok: false; error: GameError };

export function guardPlayer(state: RoomState, pid: string): Failure | null {
  return state.players[pid] ? null : fail("NOT_IN_ROOM", "You are not in this room.");
}

export function guardPlaying(state: RoomState): Failure | null {
  if (state.status === "lobby") return fail("GAME_NOT_STARTED", "The game has not started yet.");
  if (state.status === "ended") return fail("GAME_ENDED", "The game is over.");
  return null;
}

/** Knocked-out players stay in the room as spectators. */
export function guardInGame(state: RoomState, pid: string): Failure | null {
  return state.knockedOut[pid] === undefined
    ? null
    : fail("KNOCKED_OUT", "You were knocked out by a wrong guess.");
}

export function guardMaster(state: RoomState, pid: string): Failure | null {
  return state.masterPid === pid ? null : fail("NOT_MASTER", "Only the Capt. can do that.");
}

/** The player may only act on the board at their seat, and not once a due rotation has moved it. */
export function guardBoardAtSeat(
  state: RoomState,
  pid: string,
  board: number,
  now: number,
): Failure | null {
  const seat = state.players[pid]?.seat;
  if (seat === undefined || state.boardAtSeat[seat] !== board) {
    return fail("NOT_YOUR_BOARD", "That board is not at your seat.");
  }
  if (state.pendingRotation && now >= state.pendingRotation.at) {
    return fail("NOT_YOUR_BOARD", "The board is rotating away.");
  }
  return null;
}
