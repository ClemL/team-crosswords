import type { GameConfig } from "@/config";
import { pickRandom } from "./rng";
import { inGame, isActive } from "./state";
import type { RoomState } from "./types";

/**
 * §3.7: choose the next board master among active players with the fewest master assignments,
 * excluding the current master unless they are the only active player. Knocked-out players are
 * never chosen. With nobody active, the current master stays, unless they are knocked out: then
 * any player still in the game takes over.
 */
export function pickNextMaster(
  state: Pick<RoomState, "players" | "masterPid" | "masterCounts" | "knockedOut">,
  now: number,
  rng: () => number,
  cfg: GameConfig,
): string | null {
  const eligible = Object.keys(state.players)
    .filter((pid) => inGame(state, pid))
    .sort();
  const active = eligible.filter((pid) => isActive(state.players[pid], now, cfg));
  if (active.length === 0) {
    const keep = state.masterPid !== null && eligible.includes(state.masterPid);
    return keep || eligible.length === 0 ? state.masterPid : eligible[0];
  }
  if (active.length === 1) return active[0];
  const candidates = active.filter((pid) => pid !== state.masterPid);
  const counts = candidates.map((pid) => state.masterCounts[pid] ?? 0);
  const min = Math.min(...counts);
  return pickRandom(
    candidates.filter((_, i) => counts[i] === min),
    rng,
  );
}

/** Records an assignment (mutates `state`). */
export function assignMaster(state: RoomState, pid: string): void {
  state.masterPid = pid;
  state.masterCounts[pid] = (state.masterCounts[pid] ?? 0) + 1;
}

/** A late joiner starts with masterCount = min(counts of active players) (§3.7, V1.5+). */
export function initialMasterCount(
  state: Pick<RoomState, "players" | "masterCounts">,
  now: number,
  cfg: GameConfig,
): number {
  const counts = Object.keys(state.players)
    .filter((pid) => isActive(state.players[pid], now, cfg))
    .map((pid) => state.masterCounts[pid] ?? 0);
  return counts.length === 0 ? 0 : Math.min(...counts);
}

/** True when the master is missing, inactive or knocked out and someone else could take over. */
export function masterNeedsReplacement(
  state: Pick<RoomState, "players" | "masterPid" | "knockedOut">,
  now: number,
  cfg: GameConfig,
): boolean {
  const others = Object.keys(state.players).filter(
    (pid) =>
      pid !== state.masterPid && inGame(state, pid) && isActive(state.players[pid], now, cfg),
  );
  if (others.length === 0) return false;
  const master = state.masterPid ? state.players[state.masterPid] : undefined;
  return !master || !isActive(master, now, cfg) || !inGame(state, state.masterPid!);
}
