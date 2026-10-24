"use client";

import type { PlayerView, SeatingView } from "@/game/views";
import s from "./play.module.css";

/** §9.5.2 — full-width banner during the rotation countdown. Input stays enabled. */
export function RotationBanner({ view, now }: { view: PlayerView; now: number }) {
  const p = view.rotation.pending;
  if (!p) return null;
  const secs = Math.max(0, Math.ceil((p.at - now) / 1000));
  return (
    <div className={s.banner} role="status">
      Rotating {p.dir === "L" ? "⟲" : "⟳"} in {secs}…{" "}
      {p.youReceive ? `${p.youReceive.emoji} → you` : "no board for you"}
    </div>
  );
}

/** §3.6.5 — compact seating flash after a shift, e.g. "🐙 → you · 🦊 → Empty". */
export function SeatingFlash({ seating }: { seating: SeatingView }) {
  const parts = seating.seats.flatMap((seat) => {
    const who = seat.isYou ? "you" : (seat.playerName ?? "Empty");
    if (seat.boardIndex !== null) return [`${seat.emoji} → ${who}`];
    return seat.isYou ? ["no board for you"] : [];
  });
  const done = seating.boards.filter((b) => b.done);
  if (done.length > 0) parts.push(`${done.map((b) => b.emoji).join(" ")} done`);
  return (
    <div className={s.flash} role="status">
      <div className={s.flashCard}>{parts.join(" · ")}</div>
    </div>
  );
}

/**
 * The phone layout is portrait only. A phone turned sideways gets this cover instead of a squashed
 * grid (CSS shows it only on short landscape screens, so desktop windows are unaffected).
 */
export function PortraitOnly() {
  return (
    <div className={s.portraitOnly} role="alert">
      <div>
        <div className={s.portraitIcon} aria-hidden="true">
          📱
        </div>
        Turn your phone upright: the game is played in portrait.
      </div>
    </div>
  );
}
