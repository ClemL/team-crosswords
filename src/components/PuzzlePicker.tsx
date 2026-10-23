"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, post } from "@/client/api";
import home from "./home.module.css";
import ui from "./ui.module.css";

type Item = { id: string; title: string };

export function PuzzlePicker() {
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<Item[]>("/api/puzzles").then((r) => {
      if (r.ok) setItems(r.data);
      else setError(r.message);
    });
  }, []);

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
  return (
    <ul className={home.grid}>
      {items.map((g) => (
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
  );
}
