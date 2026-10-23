"use client";

import type { SeatingView } from "@/game/views";
import ui from "./ui.module.css";

/** §9.3 seating card: who holds which board, and what each rotation direction brings. */
export function SeatingCard({
  seating,
  isMaster,
  masterName,
  showNext = true,
}: {
  seating: SeatingView;
  isMaster: boolean;
  masterName: string | null;
  showNext?: boolean;
}) {
  const mine = seating.seats.find((s) => s.isYou);
  const done = seating.boards.filter((b) => b.done);
  return (
    <>
      {mine && (
        <div className={ui.section}>
          <div>
            {mine.boardIndex === null ? (
              "You have no board this rotation"
            ) : (
              <>
                You hold <span className={ui.bigEmoji}>{mine.emoji}</span>
              </>
            )}
            {mine.out && <span className={ui.muted}> · knocked out</span>}
          </div>
          <div className={ui.muted}>
            <span className={ui.capt}>Capt.</span> {isMaster ? "you" : (masterName ?? "—")}
          </div>
        </div>
      )}
      <div className={ui.section}>
        {seating.seats.map((s) => {
          const idle = s.playerName === null;
          return (
            <div key={s.seat} className={`${ui.seatRow} ${idle ? ui.idle : ""}`}>
              <span className={ui.seatEmoji} style={{ borderColor: s.color }} aria-hidden="true">
                {s.emoji || "—"}
              </span>
              <span>
                <strong>{idle ? "idle" : s.playerName}</strong>{" "}
                <span className={ui.muted}>
                  {s.isYou ? "(you)" : `(seat ${s.seat + 1})`}
                  {s.isMaster && (
                    <>
                      {" · "}
                      <span className={ui.capt}>Capt.</span>
                    </>
                  )}
                  {seating.readySeats.includes(s.seat) && !seating.timerStarted ? " · ready" : ""}
                  {s.out ? " · out" : ""}
                </span>
              </span>
              {s.boardIndex === null ? (
                <span className={ui.muted}>no board</span>
              ) : (
                <span aria-label={`${s.percent} percent solved`}>{s.percent}%</span>
              )}
            </div>
          );
        })}
        {done.length > 0 && (
          <div className={ui.muted}>
            Done, out of the ring: {done.map((b) => b.emoji).join(" ")}
          </div>
        )}
      </div>
      {showNext && (
        <div className={ui.section}>
          <div className={ui.muted}>Next rotation brings you:</div>
          <div className={ui.nextRow}>
            <span>⟲ Left</span>
            <span>
              → <span className={ui.bigEmoji}>{seating.nextIfLeft?.emoji ?? "no board"}</span>
            </span>
          </div>
          <div className={ui.nextRow}>
            <span>⟳ Right</span>
            <span>
              → <span className={ui.bigEmoji}>{seating.nextIfRight?.emoji ?? "no board"}</span>
            </span>
          </div>
        </div>
      )}
    </>
  );
}
