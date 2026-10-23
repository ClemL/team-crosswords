"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { CONFIG_V1 } from "@/config";
import { formatClock, usePoll, useServerNow } from "@/client/usePoll";
import type { HostView } from "@/game/views";
import { MetaBar } from "../MetaBar";
import { Results } from "../Results";
import ui from "../ui.module.css";
import h from "./host.module.css";

function useQr(url: string | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 560, errorCorrectionLevel: "M" })
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [url]);
  return src;
}

/** Tile positions around the ring: seat 0 at the top, then clockwise. */
function seatPosition(seat: number, n: number): { left: string; top: string } {
  const angle = -Math.PI / 2 + (seat * 2 * Math.PI) / n;
  return { left: `${50 + 30 * Math.cos(angle)}%`, top: `${52 + 30 * Math.sin(angle)}%` };
}

function Ring({ view }: { view: HostView }) {
  const n = view.seating.seats.length;
  return (
    <div className={h.ring} aria-label="Seating ring">
      <div className={h.ringArrows} aria-hidden="true" />
      {view.seating.seats.map((seat) => {
        const idle = seat.playerName === null;
        const ready = view.seating.readySeats.includes(seat.seat);
        return (
          <div
            key={seat.seat}
            className={`${h.tile} ${idle ? h.tileIdle : ""}`}
            style={{ ...seatPosition(seat.seat, n), borderColor: seat.color }}
          >
            <div className={h.tileEmoji} aria-hidden="true">
              {seat.emoji}
            </div>
            <div className={h.tileName}>
              {idle ? "idle" : seat.playerName}
              {seat.isMaster ? " ★" : ""}
            </div>
            <div className={ui.muted}>
              Seat {seat.seat + 1}
              {!view.seating.timerStarted && !idle ? (ready ? " · ready" : " · not ready") : ""}
            </div>
            <div
              className={h.bar}
              role="progressbar"
              aria-valuenow={seat.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={h.barFill}
                style={{ width: `${seat.percent}%`, background: seat.color }}
              />
            </div>
            <div>{seat.percent}%</div>
          </div>
        );
      })}
    </div>
  );
}

export function HostApp({ rid }: { rid: string }) {
  const poll = usePoll<HostView>(`/api/rooms/${rid}/host`, CONFIG_V1.hostPollIntervalMs);
  const view = poll.data;
  const now = useServerNow(poll.offset);
  const qr = useQr(view?.joinUrl);

  if (!view) {
    return (
      <main className={h.page}>
        <p>{poll.error ? poll.error.message : "Loading…"}</p>
      </main>
    );
  }

  const pending = view.rotation.pending;
  const cooling = now < view.rotation.cooldownUntil;
  const elapsed = view.timer.startedAt ? (view.timer.endedAt ?? now) - view.timer.startedAt : 0;

  return (
    <main className={h.page}>
      <div className={h.top}>
        <h1 className={h.title}>
          {view.puzzleTitle} · Room {view.rid}
        </h1>
        {view.status !== "lobby" && (
          <div className={h.stats}>
            <span className={h.stat}>
              ⏱ <strong>{formatClock(elapsed)}</strong>
            </span>
            <span className={h.stat}>
              Rotations <strong>{view.rotation.count}</strong>
            </span>
            {view.status === "playing" && (
              <span className={h.stat}>
                {pending
                  ? "Rotating…"
                  : cooling
                    ? `Cooldown ${formatClock(view.rotation.cooldownUntil - now)}`
                    : "Ready to rotate"}
              </span>
            )}
            <span className={h.stat}>
              🎟 <strong>{view.tokens.left}</strong>/{view.tokens.issued}
            </span>
          </div>
        )}
      </div>

      {pending && (
        <div className={h.banner} role="status">
          Rotating {pending.dir === "L" ? "⟲" : "⟳"} in{" "}
          {Math.max(0, Math.ceil((pending.at - now) / 1000))}…
        </div>
      )}

      {view.status === "lobby" && (
        <div className={h.lobby}>
          <div className={`${ui.card} ${h.join}`}>
            <div className={ui.muted}>Scan to join, or open</div>
            <div>
              <a href={view.joinUrl}>{view.joinUrl}</a>
            </div>
            <div className={h.code}>{view.rid}</div>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL generated on the client
              <img
                className={h.qr}
                src={qr}
                alt={`QR code for ${view.joinUrl}`}
                width={280}
                height={280}
              />
            ) : null}
          </div>
          <div className={`${ui.card}`} style={{ padding: 12 }}>
            <Ring view={view} />
            <p className={h.footer}>
              {view.players.length === 0
                ? "Waiting for a player to join…"
                : `Master: ${view.masterName ?? "—"}. The timer starts when everyone taps Ready, or when the master taps Start.`}
            </p>
          </div>
        </div>
      )}

      {view.status === "playing" && (
        <div className={ui.card} style={{ padding: 12 }}>
          <Ring view={view} />
        </div>
      )}

      {view.status === "ended" && view.result && (
        <div className={ui.card} style={{ maxWidth: 520, width: "100%", margin: "0 auto" }}>
          <Results result={view.result} metaAnswer={view.meta.answer} />
        </div>
      )}

      <div className={`${ui.card} ${h.metaWrap}`}>
        <MetaBar meta={view.meta} canGuess={false} />
      </div>
    </main>
  );
}
