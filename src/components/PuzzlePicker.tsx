"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, post } from "@/client/api";
import { MODES, type Mode } from "@/config";
import home from "./home.module.css";
import ui from "./ui.module.css";

type Item = {
  id: string;
  title: string;
  mode: Mode;
  boardSize: number;
  metaWords: number;
  parMinutes: number;
};

const MODE_KEY = "xw:mode";
const MODE_LIST = Object.keys(MODES) as Mode[];

function readMode(): Mode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v && v in MODES ? (v as Mode) : "5x";
  } catch {
    return "5x";
  }
}

/** Mode tabs (5x / 6x), then the games of that mode. */
export function PuzzlePicker() {
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("5x");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage once
    setMode(readMode());
    void apiFetch<Item[]>("/api/puzzles").then((r) => {
      if (r.ok) setItems(r.data);
      else setError(r.message);
    });
  }, []);

  const pick = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // Storage unavailable: the choice lasts for this visit only.
    }
  };

  const create = async (puzzleId: string) => {
    setBusy(puzzleId);
    const r = await post<{ rid: string }>("/api/rooms", { puzzleId });
    if (r.ok) {
      router.push(`/host/${r.data.rid}`);
      return;
    }
    setBusy(null);
    setError(r.message);
  };

  if (error) {
    return (
      <p role="alert">
        {error} Diagnostics: <a href="/api/health">/api/health</a>
      </p>
    );
  }
  if (!items) return <p>Loading games…</p>;
  if (items.length === 0)
    return <p>No games are loaded yet. Run the seed route first (see README).</p>;
  const shown = items.filter((g) => g.mode === mode);
  const spec = MODES[mode];
  return (
    <>
      <div className={home.modes} role="radiogroup" aria-label="Game mode">
        {MODE_LIST.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={m === mode}
            className={`${ui.btn} ${home.mode} ${m === mode ? ui.primary : ""}`}
            onClick={() => pick(m)}
          >
            <strong>
              {MODES[m].boardSize}×{MODES[m].boardSize}
            </strong>
            <span className={home.modeSpec}>
              {MODES[m].metaWords} metas · {MODES[m].parMinutes} min
            </span>
          </button>
        ))}
      </div>
      <p className={home.modeNote}>
        Three {spec.boardSize}×{spec.boardSize} boards, {spec.metaWords} meta words of 3 to{" "}
        {spec.metaWords + 2} letters, par {spec.parMinutes} minutes.
      </p>
      {shown.length === 0 ? (
        <p>No {mode} games are loaded. Run the seed route again (see README).</p>
      ) : (
        <ul className={home.grid}>
          {shown.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                className={`${ui.btn} ${home.game}`}
                disabled={busy !== null}
                onClick={() => create(g.id)}
              >
                {busy === g.id ? "Creating…" : g.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
