import { NAME_MAX_LENGTH } from "@/config";
import type { GameCtx } from "./context";
import { fail, type Result } from "./errors";
import { guardMaster, guardPlayer } from "./guards";
import { assignMaster, initialMasterCount } from "./master";
import {
  cloneState,
  cooldownFor,
  createRoomState,
  emptyPlayerStats,
  initialsOf,
  isActive,
} from "./state";
import type { RoomState } from "./types";

export function sanitizeName(name: unknown): string {
  return typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX_LENGTH) : "";
}

/**
 * Seat for a new player, or null when the room is full (one player per board). Players are
 * spread around the ring: the new player takes the free seat farthest from every taken seat,
 * the lowest such seat on a tie, so empty seats end up between players where the ring allows.
 */
export function seatForNewPlayer(state: RoomState, ctx: GameCtx): number | null {
  const n = state.seats.length;
  if (Object.keys(state.players).length >= ctx.puzzle.boards.length) return null;
  const taken = state.seats.flatMap((pid, i) => (pid === null ? [] : [i]));
  let best: number | null = null;
  let bestGap = -1;
  state.seats.forEach((pid, seat) => {
    if (pid !== null) return;
    const gap = Math.min(
      n,
      ...taken.map((t) => Math.min(Math.abs(seat - t), n - Math.abs(seat - t))),
    );
    if (gap > bestGap) [best, bestGap] = [seat, gap];
  });
  return best;
}

/**
 * Join or rejoin (§7.4 join). A known playerId reclaims its seat; otherwise the player takes a
 * free seat. The first player becomes board master (§3.1.5).
 */
export function joinRoom(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  rawName: unknown,
  now: number,
): Result<{ state: RoomState; seat: number; rejoined: boolean }> {
  const name = sanitizeName(rawName);
  const existing = state.players[pid];
  if (existing) {
    const next = cloneState(state);
    const p = next.players[pid];
    if (name && name !== p.name) {
      p.name = name;
      p.initials = initialsOf(name);
    }
    p.lastSeen = Math.max(p.lastSeen, now);
    return { ok: true, state: next, seat: p.seat, rejoined: true };
  }
  if (state.status === "ended") return fail("GAME_ENDED", "The game is over.");
  if (!name) return fail("BAD_REQUEST", "Enter a name.");
  const seat = seatForNewPlayer(state, ctx);
  if (seat === null) return fail("ROOM_FULL", "This room is full.");
  const next = cloneState(state);
  next.masterCounts[pid] = initialMasterCount(next, now, ctx.cfg);
  next.players[pid] = {
    name,
    initials: initialsOf(name),
    seat,
    joinedAt: now,
    lastSeen: now,
    activeSeconds: 0,
  };
  next.seats[seat] = pid;
  next.playerStats[pid] = emptyPlayerStats();
  if (next.masterPid === null) assignMaster(next, pid);
  return { ok: true, state: next, seat, rejoined: false };
}

/** Starts the timer (mutates `state`). In multiplayer the first rotation waits one cooldown. */
function startTimer(state: RoomState, ctx: GameCtx, now: number): void {
  state.status = "playing";
  state.timerStartedAt = now;
  state.cooldownUntil = now + cooldownFor(state, ctx.cfg);
}

/** Ready (§3.2): the timer starts once every active player is ready. */
export function markReady(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  now: number,
): Result<{ state: RoomState; started: boolean }> {
  const g = guardPlayer(state, pid);
  if (g) return g;
  if (state.status !== "lobby") return { ok: true, state, started: false };
  const next = cloneState(state);
  if (!next.ready.includes(pid)) next.ready.push(pid);
  const active = Object.keys(next.players).filter(
    (id) => id === pid || isActive(next.players[id], now, ctx.cfg),
  );
  const started = active.every((id) => next.ready.includes(id));
  if (started) startTimer(next, ctx, now);
  return { ok: true, state: next, started };
}

/** Start (§3.2): master override. */
export function masterStart(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  now: number,
): Result<{ state: RoomState }> {
  const g = guardPlayer(state, pid) ?? guardMaster(state, pid);
  if (g) return g;
  if (state.status === "ended") return fail("GAME_ENDED", "The game is over.");
  if (state.status === "playing") return { ok: true, state };
  const next = cloneState(state);
  startTimer(next, ctx, now);
  return { ok: true, state: next };
}

/**
 * Ends the round and starts the same puzzle again: empty boards, no rotations, no meta words, back
 * in the lobby with the same players in the same seats, the same Capt. and the same board emojis.
 * While a game is on, only the Capt. may do it; once it has ended, anyone may.
 */
export function restartRoom(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  now: number,
): Result<{ state: RoomState }> {
  const g = guardPlayer(state, pid) ?? (state.status === "ended" ? null : guardMaster(state, pid));
  if (g) return g;
  const fresh = createRoomState({
    rid: state.rid,
    puzzle: ctx.puzzle,
    now,
    rng: () => 0, // the emojis are kept below
    cfg: ctx.cfg,
  });
  const next: RoomState = {
    ...fresh,
    version: state.version,
    createdAt: state.createdAt,
    boardEmojis: state.boardEmojis,
    seats: [...state.seats],
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, p]) => [id, { ...p, activeSeconds: 0 }]),
    ),
    playerStats: Object.fromEntries(
      Object.keys(state.players).map((id) => [id, emptyPlayerStats()]),
    ),
    masterPid: state.masterPid,
    masterCounts: { ...state.masterCounts },
  };
  return { ok: true, state: next };
}
