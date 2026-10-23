"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { post } from "@/client/api";
import {
  clueAt,
  defaultSelection,
  firstEmptyInWord,
  isOpenCell,
  isWordFilled,
  key,
  moveBy,
  nextInWord,
  orderedClues,
  prevInWord,
  type Selection,
} from "@/client/board-nav";
import { formatClock, useServerNow } from "@/client/usePoll";
import type { ClueView, PlayerView } from "@/game/views";
import type { Cell, RotationDir } from "@/game/types";
import { MapIcon } from "../MapIcon";
import { MetaBar } from "../MetaBar";
import ui from "../ui.module.css";
import { ClueBarText, ClueList, clueLabel } from "./ClueList";
import { Grid } from "./Grid";
import { Keyboard } from "./Keyboard";
import s from "./play.module.css";

type Edit = { letter: string; seq: number; ackVersion: number | null };

export type Actions = {
  enqueue: <T>(task: () => Promise<T>) => Promise<T>;
  refresh: () => void;
  reset: () => void;
  toast: (msg: string) => void;
};

export function BoardScreen({
  view,
  rid,
  pid,
  offset,
  actions,
  onMap,
}: {
  view: PlayerView;
  rid: string;
  pid: string;
  offset: number;
  actions: Actions;
  onMap: () => void;
}) {
  const { enqueue, refresh, reset, toast } = actions;
  const board = view.board;
  const now = useServerNow(offset);
  const playing = view.status === "playing";

  // Selection resets when a different board arrives.
  const [sel, setSel] = useState<Selection>(() => defaultSelection(board));
  const [selBoard, setSelBoard] = useState(board.index);
  if (selBoard !== board.index) {
    setSelBoard(board.index);
    setSel(defaultSelection(board));
  }

  // Newly locked cells animate green once, compared with the last time this board was seen.
  const [track, setTrack] = useState<{
    version: number;
    seen: Record<number, string[]>;
    fresh: string[];
  }>(() => ({
    version: view.version,
    seen: { [board.index]: board.lockedCells },
    fresh: [],
  }));
  if (track.version !== view.version) {
    const prev = track.seen[board.index];
    setTrack({
      version: view.version,
      seen: { ...track.seen, [board.index]: board.lockedCells },
      fresh: prev ? board.lockedCells.filter((k) => !prev.includes(k)) : [],
    });
  }
  const fresh = useMemo(() => new Set(track.fresh), [track.fresh]);

  // Optimistic edits (§9.4.7), keyed "board:r,c". Acked edits stop applying once the view catches up.
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const seq = useRef(0);
  const prefix = `${board.index}:`;
  const { entries, pendingKeys } = useMemo(() => {
    const out = { ...board.entries };
    const pending = new Set<string>();
    for (const [k, e] of Object.entries(edits)) {
      if (!k.startsWith(prefix)) continue;
      if (e.ackVersion !== null && view.version >= e.ackVersion) continue;
      const cell = k.slice(prefix.length);
      if (e.letter) out[cell] = e.letter;
      else delete out[cell];
      if (e.ackVersion === null) pending.add(cell);
    }
    return { entries: out, pendingKeys: pending };
  }, [board.entries, edits, prefix, view.version]);

  const locked = useMemo(() => new Set(board.lockedCells), [board.lockedCells]);
  const clue: ClueView | undefined =
    clueAt(board, sel.r, sel.c, sel.dir) ??
    clueAt(board, sel.r, sel.c, sel.dir === "A" ? "D" : "A");

  const sendEntry = useCallback(
    (r: number, c: number, letter: string) => {
      const k = `${board.index}:${key(r, c)}`;
      const mySeq = ++seq.current;
      const version = view.version;
      setEdits((prev) => {
        const next: Record<string, Edit> = {};
        for (const [kk, e] of Object.entries(prev)) {
          if (e.ackVersion === null || e.ackVersion > version) next[kk] = e;
        }
        next[k] = { letter, seq: mySeq, ackVersion: null };
        return next;
      });
      void enqueue(() =>
        post<{ version: number }>(`/api/rooms/${rid}/cell`, {
          pid,
          board: board.index,
          r,
          c,
          letter,
        }),
      ).then((res) => {
        if (res.ok) {
          setEdits((prev) =>
            prev[k]?.seq === mySeq
              ? { ...prev, [k]: { ...prev[k], ackVersion: res.data.version } }
              : prev,
          );
          refresh();
          return;
        }
        if (res.code === "NOT_YOUR_BOARD") {
          setEdits({});
          reset();
          return;
        }
        setEdits((prev) => {
          if (prev[k]?.seq !== mySeq) return prev;
          const next = { ...prev };
          delete next[k];
          return next;
        });
        if (res.code !== "LOCKED_CELL") toast(res.message);
        refresh();
      });
    },
    [board.index, enqueue, pid, refresh, reset, rid, toast, view.version],
  );

  const typeLetter = useCallback(
    (letter: string) => {
      if (!playing || !clue) return;
      let [r, c] = [sel.r, sel.c];
      if (locked.has(key(r, c))) {
        const n = nextInWord(clue, r, c, locked);
        if (!n) return;
        [r, c] = n;
      }
      sendEntry(r, c, letter);
      const n = nextInWord(clue, r, c, locked);
      setSel({ r: n?.[0] ?? r, c: n?.[1] ?? c, dir: clue.dir });
    },
    [clue, locked, playing, sel, sendEntry],
  );

  const backspace = useCallback(() => {
    if (!playing) return;
    const k = key(sel.r, sel.c);
    if (!locked.has(k) && entries[k]) {
      sendEntry(sel.r, sel.c, "");
      return;
    }
    const p = clue ? prevInWord(clue, sel.r, sel.c, locked) : null;
    if (!p) return;
    if (entries[key(p[0], p[1])]) sendEntry(p[0], p[1], "");
    setSel({ r: p[0], c: p[1], dir: sel.dir });
  }, [clue, entries, locked, playing, sel, sendEntry]);

  const tapCell = useCallback(
    (r: number, c: number) => {
      if (sel.r === r && sel.c === c) {
        const other = sel.dir === "A" ? "D" : "A";
        if (clueAt(board, r, c, other)) setSel({ r, c, dir: other });
        return;
      }
      const dir = clueAt(board, r, c, sel.dir) ? sel.dir : sel.dir === "A" ? "D" : "A";
      setSel({ r, c, dir });
    },
    [board, sel],
  );

  const pickClue = useCallback(
    (cl: ClueView) => {
      const [r, c] = firstEmptyInWord(cl, entries, locked);
      setSel({ r, c, dir: cl.dir });
    },
    [entries, locked],
  );

  const stepClue = useCallback(
    (delta: number) => {
      const list = orderedClues(board);
      const i = clue ? list.findIndex((x) => x.id === clue.id) : -1;
      pickClue(list[(i + delta + list.length) % list.length]);
    },
    [board, clue, pickClue],
  );

  const suspectHere = board.suspects[key(sel.r, sel.c)] !== undefined;
  const toggleSuspect = useCallback(() => {
    if (!playing || locked.has(key(sel.r, sel.c))) return;
    void enqueue(() =>
      post(`/api/rooms/${rid}/suspect`, {
        pid,
        board: board.index,
        r: sel.r,
        c: sel.c,
        on: !suspectHere,
      }),
    ).then((res) => {
      if (!res.ok && res.code !== "LOCKED_CELL") toast(res.message);
      refresh();
    });
  }, [board.index, enqueue, locked, pid, playing, refresh, rid, sel, suspectHere, toast]);

  const canCheck =
    playing &&
    !!clue &&
    clue.state === "pending" &&
    isWordFilled(clue, entries) &&
    view.tokens.left > 0;
  const check = useCallback(() => {
    if (!clue || !canCheck) return;
    const label = `${board.emoji} ${clueLabel(clue)}`;
    void enqueue(() =>
      post<{ wrong: Cell[]; locked: boolean; tokensLeft: number }>(`/api/rooms/${rid}/check`, {
        pid,
        board: board.index,
        clueId: clue.id,
      }),
    ).then((res) => {
      if (res.ok) {
        const n = res.data.wrong.length;
        toast(
          res.data.locked
            ? `${label} is correct and locked ✓`
            : `${label}: ${n} wrong ${n === 1 ? "cell" : "cells"}`,
        );
      } else {
        toast(res.message);
      }
      refresh();
    });
  }, [board.emoji, board.index, canCheck, clue, enqueue, pid, refresh, rid, toast]);

  const rotate = useCallback(
    (dir: RotationDir) => {
      void enqueue(() => post(`/api/rooms/${rid}/rotate`, { pid, dir })).then((res) => {
        if (!res.ok) toast(res.message);
        refresh();
      });
    },
    [enqueue, pid, refresh, rid, toast],
  );

  const finalCheck = useCallback(() => {
    void enqueue(() => post(`/api/rooms/${rid}/final-check`, { pid })).then((res) => {
      if (!res.ok) toast(res.message);
      refresh();
    });
  }, [enqueue, pid, refresh, rid, toast]);

  const guess = useCallback(
    async (g: string) => {
      const res = await enqueue(() =>
        post<{
          correct: boolean;
          guessesLeft: number;
          metaId: string | null;
          points: number | null;
        }>(`/api/rooms/${rid}/meta`, {
          pid,
          guess: g,
        }),
      );
      refresh();
      if (!res.ok) {
        toast(res.message);
        return null;
      }
      return res.data;
    },
    [enqueue, pid, refresh, rid, toast],
  );

  // Physical keyboard (desktop): letters, Backspace, arrows, Space toggles direction, Tab = next clue.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    keyHandler.current = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (/^[a-zA-Z]$/.test(k)) {
        e.preventDefault();
        typeLetter(k.toUpperCase());
      } else if (k === "Backspace" || k === "Delete") {
        e.preventDefault();
        backspace();
      } else if (k === " ") {
        e.preventDefault();
        tapCell(sel.r, sel.c);
      } else if (k === "Tab") {
        e.preventDefault();
        stepClue(e.shiftKey ? -1 : 1);
      } else if (k.startsWith("Arrow")) {
        e.preventDefault();
        const [dr, dc, dir] =
          k === "ArrowUp"
            ? [-1, 0, "D"]
            : k === "ArrowDown"
              ? [1, 0, "D"]
              : k === "ArrowLeft"
                ? [0, -1, "A"]
                : [0, 1, "A"];
        if (sel.dir !== dir && clueAt(board, sel.r, sel.c, dir as "A" | "D")) {
          setSel({ ...sel, dir: dir as "A" | "D" });
          return;
        }
        const [r, c] = moveBy(board.layout, sel.r, sel.c, dr as number, dc as number);
        if (isOpenCell(board.layout, r, c))
          setSel({ r, c, dir: clueAt(board, r, c, sel.dir) ? sel.dir : (dir as "A" | "D") });
      }
    };
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const pending = view.rotation.pending;
  const cooling = now < view.rotation.cooldownUntil;
  const canRotate = playing && view.you.isMaster && !cooling && !pending;
  const elapsed = view.timer.startedAt ? (view.timer.endedAt ?? now) - view.timer.startedAt : 0;

  return (
    <div className={s.screen} style={{ "--board-color": board.color } as React.CSSProperties}>
      <header className={s.header}>
        <div className={s.headerRow}>
          <span className={s.boardEmoji} aria-label="Your board">
            {board.emoji}
          </span>
          <span className={s.progress}>
            {board.lockedCount}/{board.totalCount} · {board.percent}%
          </span>
          <span className={s.timer} aria-label="Game time">
            ⏱ {formatClock(elapsed)}
          </span>
          <button type="button" className={s.iconBtn} onClick={onMap} aria-label="Seating map">
            <MapIcon />
          </button>
        </div>
        <div className={s.controlRow}>
          {view.you.isMaster ? (
            <>
              <button
                type="button"
                className={s.rotateBtn}
                disabled={!canRotate}
                onClick={() => rotate("L")}
                aria-label={`Rotate left: you receive ${view.seating.nextIfLeft.emoji}`}
              >
                ⟲ <span className={s.rotateEmoji}>{view.seating.nextIfLeft.emoji}</span>
              </button>
              <button
                type="button"
                className={s.rotateBtn}
                disabled={!canRotate}
                onClick={() => rotate("R")}
                aria-label={`Rotate right: you receive ${view.seating.nextIfRight.emoji}`}
              >
                ⟳ <span className={s.rotateEmoji}>{view.seating.nextIfRight.emoji}</span>
              </button>
              <span className={ui.capt}>Capt.</span>
              {(pending || cooling) && (
                <span className={s.cooldown} aria-live="off">
                  {pending ? "rotating…" : formatClock(view.rotation.cooldownUntil - now)}
                </span>
              )}
              {view.rotation.canFinalCheck && (
                <button
                  type="button"
                  className={s.finalBtn}
                  disabled={!canRotate}
                  onClick={finalCheck}
                >
                  Final Check
                </button>
              )}
            </>
          ) : (
            <span className={s.cooldown}>
              Rotation #{view.rotation.count} ·{" "}
              {cooling
                ? `cooldown ${formatClock(view.rotation.cooldownUntil - now)}`
                : "waiting on the "}
              {!cooling && <span className={ui.capt}>Capt.</span>}
            </span>
          )}
        </div>
      </header>

      <Grid
        board={board}
        entries={entries}
        pendingKeys={pendingKeys}
        sel={sel}
        fresh={fresh}
        onCell={tapCell}
      />

      <div className={s.clueBar}>
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => stepClue(-1)}
          aria-label="Previous clue"
        >
          ‹
        </button>
        <button type="button" className={s.clueBarText} onClick={() => tapCell(sel.r, sel.c)}>
          <ClueBarText clue={clue} />
        </button>
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => stepClue(1)}
          aria-label="Next clue"
        >
          ›
        </button>
        <button
          type="button"
          className={`${ui.btn} ${ui.primary}`}
          disabled={!canCheck}
          onClick={check}
          aria-label={`Check this word: ${view.tokens.left} ${view.tokens.left === 1 ? "check" : "checks"} left`}
        >
          Check 🎟{view.tokens.left}
        </button>
      </div>

      <ClueList board={board} activeId={clue?.id} onPick={pickClue} />

      <Keyboard
        onLetter={typeLetter}
        onBackspace={backspace}
        onSuspect={toggleSuspect}
        suspectActive={suspectHere}
        disabled={!playing}
      />

      <div className={s.metaWrap}>
        <MetaBar meta={view.meta} onGuess={guess} canGuess={playing} />
      </div>
    </div>
  );
}
