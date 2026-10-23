import type { GameCtx } from "./context";
import { fail, type Result } from "./errors";
import { guardMaster, guardPlayer, guardPlaying } from "./guards";
import { assignMaster, pickNextMaster } from "./master";
import { runPulse } from "./pulse";
import { shiftRing } from "./ring";
import { allCellsFilled, cloneState } from "./state";
import type { RoomState, RotationDir } from "./types";

function guardCooldown(state: RoomState, now: number) {
  if (state.pendingRotation) return fail("COOLDOWN", "A rotation is already under way.");
  if (now < state.cooldownUntil) return fail("COOLDOWN", "Cooldown has not expired.");
  return null;
}

/** Master asks for a rotation (§3.6.3): it happens after rotationWarningMs. */
export function requestRotation(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  dir: RotationDir,
  now: number,
): Result<{ state: RoomState }> {
  const g =
    guardPlayer(state, pid) ??
    guardPlaying(state) ??
    guardMaster(state, pid) ??
    guardCooldown(state, now);
  if (g) return g;
  const next = cloneState(state);
  next.pendingRotation = { dir, at: now + ctx.cfg.rotationWarningMs };
  return { ok: true, state: next };
}

/**
 * Completes a due rotation (§3.6.4), in the order the spec gives:
 * pulse → shift → rotations++ → cooldown → next master.
 */
export function completeRotation(
  state: RoomState,
  ctx: GameCtx,
  now: number,
  rng: () => number,
): RoomState {
  const pending = state.pendingRotation;
  if (!pending) return state;
  const next = runPulse(state, ctx, now).state;
  next.boardAtSeat = shiftRing(next.boardAtSeat, pending.dir);
  next.rotations += 1;
  next.cooldownUntil = now + ctx.cfg.cooldownMs;
  next.pendingRotation = null;
  if (next.status === "playing") {
    const master = pickNextMaster(next, now, rng, ctx.cfg);
    if (master) assignMaster(next, master);
  }
  return next;
}

/** Final Check (§3.4.4): pulse without rotating once every cell on every board is filled. */
export function finalCheck(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  now: number,
): Result<{ state: RoomState }> {
  const g =
    guardPlayer(state, pid) ??
    guardPlaying(state) ??
    guardMaster(state, pid) ??
    guardCooldown(state, now);
  if (g) return g;
  if (!allCellsFilled(state, ctx))
    return fail("NOT_FILLED", "Every cell on every board must be filled.");
  const next = runPulse(state, ctx, now).state;
  next.finalCheckAt = now;
  if (next.status === "playing") next.cooldownUntil = now + ctx.cfg.cooldownMs;
  return { ok: true, state: next };
}
