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
      Rotating {p.dir === "L" ? "⟲" : "⟳"} in {secs}… {p.youReceive.emoji} → you
    </div>
  );
}

/** §3.6.5 — compact seating flash after a shift, e.g. "🐙 → you · 🦊 → idle". */
export function SeatingFlash({ seating }: { seating: SeatingView }) {
  const parts = seating.seats.map((seat) => {
    const who = seat.isYou ? "you" : (seat.playerName ?? "idle");
    return `${seat.emoji} → ${who}`;
  });
  return (
    <div className={s.flash} role="status">
      <div className={s.flashCard}>{parts.join(" · ")}</div>
    </div>
  );
}
