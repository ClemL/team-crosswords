"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONFIG_V1, NAME_MAX_LENGTH } from "@/config";
import { createQueue, post } from "@/client/api";
import {
  getOrCreatePid,
  getStoredName,
  hasJoined,
  rememberJoined,
  storeName,
} from "@/client/identity";
import { usePoll, useServerNow } from "@/client/usePoll";
import type { PlayerView } from "@/game/views";
import { Modal } from "../Modal";
import { Results } from "../Results";
import { SeatingCard } from "../SeatingCard";
import { MetaBar } from "../MetaBar";
import ui from "../ui.module.css";
import { BoardScreen, type Actions } from "./BoardScreen";
import { RotationBanner, SeatingFlash } from "./Overlays";
import s from "./play.module.css";

export function PlayApp({ rid }: { rid: string }) {
  const [pid, setPid] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const enqueue = useMemo(() => createQueue(), []);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const join = useCallback(
    async (id: string, playerName: string) => {
      setJoining(true);
      setJoinError(null);
      const res = await post<{ playerId: string; seat: number }>(`/api/rooms/${rid}/join`, {
        name: playerName,
        playerId: id,
      });
      setJoining(false);
      if (res.ok) {
        rememberJoined(rid);
        setJoined(true);
      } else {
        setJoinError(res.code === "NOT_FOUND" ? `Room ${rid} was not found.` : res.message);
      }
    },
    [rid],
  );

  // Identity comes from browser storage, so it is read after mount; a known player rejoins at once.
  useEffect(() => {
    const id = getOrCreatePid();
    const stored = getStoredName();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage once
    setPid(id);
    setName(stored);
    if (hasJoined(rid)) void join(id, stored);
  }, [join, rid]);

  const poll = usePoll<PlayerView>(
    joined && pid ? `/api/rooms/${rid}/state?pid=${encodeURIComponent(pid)}` : null,
    CONFIG_V1.pollIntervalMs,
  );
  const view = poll.data;
  const now = useServerNow(poll.offset);

  // Seating flash after each shift (§3.6.5).
  const [flash, setFlash] = useState<{ count: number; until: number } | null>(null);
  const [lastCount, setLastCount] = useState<number | null>(null);
  if (view && view.rotation.count !== lastCount) {
    setLastCount(view.rotation.count);
    if (lastCount !== null && view.rotation.count > lastCount) {
      setFlash({ count: view.rotation.count, until: now + CONFIG_V1.seatingFlashMs });
    }
  }

  const { refresh, reset } = poll;
  const actions: Actions = useMemo(
    () => ({ enqueue, refresh, reset, toast }),
    [enqueue, refresh, reset, toast],
  );

  const ready = async (start: boolean) => {
    if (!pid) return;
    const res = await enqueue(() =>
      post(`/api/rooms/${rid}/${start ? "start" : "ready"}`, { pid }),
    );
    if (!res.ok) toast(res.message);
    refresh();
  };

  if (poll.error?.code === "NOT_IN_ROOM" && joined) {
    // The room no longer knows this player (e.g. it expired): back to the join form.
    return (
      <main className={s.centered}>
        <p>This room no longer has your seat.</p>
        <Link href="/">Start a new game</Link>
      </main>
    );
  }

  if (!joined) {
    return (
      <main className={s.centered}>
        <h1 className={s.title}>Room {rid}</h1>
        <form
          className={`${ui.card} ${s.panel}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!pid || !name.trim()) return;
            storeName(name.trim());
            void join(pid, name.trim());
          }}
        >
          <div className={ui.section}>
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              className={ui.input}
              value={name}
              maxLength={NAME_MAX_LENGTH}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
              style={{ marginTop: 6 }}
            />
            {joinError && <p className={s.error}>{joinError}</p>}
          </div>
          <div className={`${ui.section} ${ui.actions}`}>
            <button
              type="submit"
              className={`${ui.btn} ${ui.primary}`}
              disabled={!pid || !name.trim() || joining}
            >
              {joining ? "Joining…" : "Join"}
            </button>
          </div>
        </form>
      </main>
    );
  }

  if (!view) {
    return (
      <main className={s.centered}>
        <p>{poll.error ? poll.error.message : "Loading…"}</p>
      </main>
    );
  }

  const masterName = view.seating.seats.find((x) => x.isMaster)?.playerName ?? null;

  if (view.status === "lobby") {
    return (
      <main className={s.centered}>
        <h1 className={s.title}>
          {view.puzzleTitle} · Room {rid}
        </h1>
        <div className={`${ui.card} ${s.panel}`}>
          <SeatingCard
            seating={view.seating}
            isMaster={view.you.isMaster}
            masterName={masterName}
          />
          <div className={`${ui.section} ${ui.actions}`}>
            <button
              type="button"
              className={`${ui.btn} ${ui.primary}`}
              disabled={view.you.ready}
              onClick={() => ready(false)}
            >
              {view.you.ready ? "Ready ✓" : "I'm ready"}
            </button>
            {view.you.isMaster && (
              <button type="button" className={ui.btn} onClick={() => ready(true)}>
                Start now
              </button>
            )}
          </div>
        </div>
        {toastMsg && <div className={ui.toast}>{toastMsg}</div>}
      </main>
    );
  }

  if (view.status === "ended" && view.result) {
    return (
      <main className={s.centered}>
        <h1 className={s.title}>{view.puzzleTitle} complete</h1>
        <div className={`${ui.card} ${s.panel}`}>
          <Results result={view.result} metaAnswer={view.meta.answer} />
          <div className={ui.section}>
            <MetaBar meta={view.meta} canGuess={false} />
          </div>
          <div className={`${ui.section} ${ui.actions}`}>
            <Link className={`${ui.btn} ${ui.primary}`} href="/">
              Play another game
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <BoardScreen
        view={view}
        rid={rid}
        pid={pid!}
        offset={poll.offset}
        actions={actions}
        onMap={() => setShowMap(true)}
      />
      <RotationBanner view={view} now={now} />
      {flash && now < flash.until && <SeatingFlash seating={view.seating} />}
      {showMap && (
        <Modal title="Seating" onClose={() => setShowMap(false)}>
          <SeatingCard
            seating={view.seating}
            isMaster={view.you.isMaster}
            masterName={masterName}
          />
        </Modal>
      )}
      {toastMsg && (
        <div className={ui.toast} role="status">
          {toastMsg}
        </div>
      )}
    </>
  );
}
