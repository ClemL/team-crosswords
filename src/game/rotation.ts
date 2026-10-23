import type { GameCtx } from "./context";
import { fail, type Result } from "./errors";
import { guardMaster, guardPlayer, guardPlaying } from "./guards";
import { assignMaster, pickNextMaster } from "./master";
import { parseCellKey, solutionLetter } from "./puzzle";
import { runPulse } from "./pulse";
import { rotateRing } from "./ring";
import {
  allCellsFilled,
  boardComplete,
  cloneState,
  cooldownFor,
  inGame,
  isSinglePlayer,
  seatedInGame,
  statsFor,
} from "./state";
import type { RoomState, RotationDir } from "./types";

function guardCooldown(state: RoomState, now: number) {
  if (state.pendingRotation) return fail("COOLDOWN", "A rotation is already under way.");
  if (now < state.cooldownUntil) return fail("COOLDOWN", "Cooldown has not expired.");
  return null;
}

/**
 * The Capt. asks for a rotation (§3.6.3). In multiplayer it happens after rotationWarningMs so
 * everyone sees it coming; with a single player it happens at once.
 */
export function requestRotation(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  dir: RotationDir,
  now: number,
  rng: () => number,
): Result<{ state: RoomState }> {
  const g =
    guardPlayer(state, pid) ??
    guardPlaying(state) ??
    guardMaster(state, pid) ??
    guardCooldown(state, now);
  if (g) return g;
  const next = cloneState(state);
  if (isSinglePlayer(state)) {
    next.pendingRotation = { dir, at: now };
    return { ok: true, state: completeRotation(next, ctx, now, rng) };
  }
  next.pendingRotation = { dir, at: now + ctx.cfg.rotationWarningMs };
  return { ok: true, state: next };
}

/**
 * Adds, for every player still in the game, the wrong letters they typed on the board at their
 * seat, which the rotation is about to pass on (mutates `state`). A letter left wrong through
 * several rotations counts at each one.
 */
function countWrongLeft(state: RoomState, ctx: GameCtx): void {
  state.seats.forEach((pid, seat) => {
    const board = state.boardAtSeat[seat];
    if (pid === null || board === null || !inGame(state, pid)) return;
    const b = state.boards[board];
    let wrong = 0;
    for (const [k, letter] of Object.entries(b.entries)) {
      const [r, c] = parseCellKey(k);
      if (b.authors[k] === pid && letter !== solutionLetter(ctx.solution, board, r, c)) wrong++;
    }
    if (wrong > 0) statsFor(state, pid).wrongLeft += wrong;
  });
}

/**
 * Completes a due rotation (§3.6.4), in the order the spec gives:
 * pulse → shift → rotations++ → cooldown → next master.
 * Before the shift, every board whose words are all locked leaves the ring, so nobody is handed a
 * finished board; players left without one take a board from a seat nobody plays (rotateRing).
 */
export function completeRotation(
  state: RoomState,
  ctx: GameCtx,
  now: number,
  rng: () => number,
): RoomState {
  const pending = state.pendingRotation;
  if (!pending) return state;
  // Credit the Capt. and count the wrong letters each player passes on before the pulse: a pulse
  // that ends the game freezes the scorecards.
  const credited = cloneState(state);
  if (credited.masterPid) statsFor(credited, credited.masterPid).rotations += 1;
  countWrongLeft(credited, ctx);
  const next = runPulse(credited, ctx, now).state;
  if (next.status === "playing") {
    next.boardAtSeat = next.boardAtSeat.map((b) =>
      b !== null && boardComplete(next, ctx, b) ? null : b,
    );
  }
  next.boardAtSeat = rotateRing(next.boardAtSeat, pending.dir, seatedInGame(next));
  next.rotations += 1;
  next.cooldownUntil = now + cooldownFor(next, ctx.cfg);
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
  if (next.status === "playing") next.cooldownUntil = now + cooldownFor(next, ctx.cfg);
  return { ok: true, state: next };
}
