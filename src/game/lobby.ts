import { NAME_MAX_LENGTH } from "@/config";
import type { GameCtx } from "./context";
import { fail, type Result } from "./errors";
import { guardMaster, guardPlayer } from "./guards";
import { assignMaster, initialMasterCount } from "./master";
import { cloneState, cooldownFor, initialsOf, isActive } from "./state";
import type { RoomState } from "./types";

export function sanitizeName(name: unknown): string {
  return typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX_LENGTH) : "";
}

/** Next free seat for a new player, or null when the room is full. V1: seat 0. */
export function seatForNewPlayer(state: RoomState, ctx: GameCtx): number | null {
  if (Object.keys(state.players).length >= ctx.cfg.maxPlayers) return null;
  const seat = state.seats.findIndex((s) => s === null);
  return seat === -1 ? null : seat;
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
  if (next.masterPid === null) assignMaster(next, pid);
  if (next.status === "playing") {
    // Late joiner (V1.5+): add their Check tokens.
    next.tokensIssued += ctx.cfg.tokensPerPlayer;
    next.tokensLeft += ctx.cfg.tokensPerPlayer;
  }
  return { ok: true, state: next, seat, rejoined: false };
}

/** Starts the timer (mutates `state`). In multiplayer the first rotation waits one cooldown. */
function startTimer(state: RoomState, ctx: GameCtx, now: number): void {
  const players = Object.keys(state.players).length;
  state.status = "playing";
  state.timerStartedAt = now;
  state.cooldownUntil = now + cooldownFor(state, ctx.cfg);
  state.tokensIssued = ctx.cfg.tokensPerPlayer * players;
  state.tokensLeft = state.tokensIssued;
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
