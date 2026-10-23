import type { GameConfig } from "@/config";
import type { PlayerRecord, RoomState } from "./types";

/**
 * Records that a player was seen at `now` and accrues active seconds while the timer runs.
 * A gap longer than inactiveAfterMs counts as inactive time.
 */
export function accrueActivity(
  p: PlayerRecord,
  timer: Pick<RoomState, "timerStartedAt" | "endedAt">,
  now: number,
  cfg: GameConfig,
): PlayerRecord {
  let activeSeconds = p.activeSeconds;
  if (timer.timerStartedAt !== null && now - p.lastSeen <= cfg.inactiveAfterMs) {
    const from = Math.max(p.lastSeen, timer.timerStartedAt);
    const to = timer.endedAt !== null ? Math.min(now, timer.endedAt) : now;
    if (to > from) activeSeconds += (to - from) / 1000;
  }
  return { ...p, lastSeen: Math.max(p.lastSeen, now), activeSeconds };
}
