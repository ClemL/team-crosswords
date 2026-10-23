import type { GameConfig } from "@/config";
import type { GameCtx } from "./context";
import { assignMaster, masterNeedsReplacement, pickNextMaster } from "./master";
import { completeRotation } from "./rotation";
import { cloneState, isActive } from "./state";
import type { RoomState } from "./types";

type TransitionInput = Pick<
  RoomState,
  "status" | "pendingRotation" | "cooldownUntil" | "masterPid" | "players"
>;

function masterIdleExpired(s: TransitionInput, now: number, cfg: GameConfig): boolean {
  if (s.status !== "playing" || s.pendingRotation) return false;
  if (now <= s.cooldownUntil + cfg.masterIdleTimeoutMs) return false;
  // Mastership can only pass if another active player exists.
  return Object.keys(s.players).some(
    (pid) => pid !== s.masterPid && isActive(s.players[pid], now, cfg),
  );
}

/**
 * Cheap check used by the polling fast path: true when applyDueTransitions would change state.
 * Needs only room meta and the players hash.
 */
export function hasDueTransition(s: TransitionInput, now: number, cfg: GameConfig): boolean {
  if (s.status === "playing" && s.pendingRotation && s.pendingRotation.at <= now) return true;
  if (masterIdleExpired(s, now, cfg)) return true;
  return s.status !== "ended" && masterNeedsReplacement(s, now, cfg);
}

/**
 * Lazy transitions (§7.2), applied at the start of every route:
 * 1. a due rotation completes; 2. otherwise an idle master loses mastership;
 * 3. an inactive master loses mastership.
 */
export function applyDueTransitions(
  state: RoomState,
  ctx: GameCtx,
  now: number,
  rng: () => number,
): { state: RoomState; changed: boolean } {
  let s = state;
  let changed = false;
  if (s.status === "playing" && s.pendingRotation && s.pendingRotation.at <= now) {
    s = completeRotation(s, ctx, now, rng);
    changed = true;
  } else if (masterIdleExpired(s, now, ctx.cfg)) {
    const next = pickNextMaster(s, now, rng, ctx.cfg);
    if (next && next !== s.masterPid) {
      s = cloneState(s);
      assignMaster(s, next);
      s.cooldownUntil = now; // reset the idle clock
      changed = true;
    }
  }
  if (s.status !== "ended" && masterNeedsReplacement(s, now, ctx.cfg)) {
    const next = pickNextMaster(s, now, rng, ctx.cfg);
    if (next && next !== s.masterPid) {
      if (!changed) s = cloneState(s);
      assignMaster(s, next);
      changed = true;
    }
  }
  return { state: s, changed };
}
