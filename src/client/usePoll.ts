"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, type ApiFailure } from "./api";

type Versioned = { version: number; now: number };

/**
 * Versioned polling (§10): `GET url&since=<version>` every `intervalMs`; 304 keeps the current
 * view. Pauses while the tab is hidden and polls immediately when it becomes visible.
 * `offset` is serverNow − deviceNow, for countdowns.
 */
export function usePoll<T extends Versioned>(url: string | null, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [offset, setOffset] = useState(0);
  const control = useRef<{ poll: () => void; reset: () => void } | null>(null);

  useEffect(() => {
    if (!url) return;
    let version: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let again = false;
    let alive = true;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    async function run(): Promise<void> {
      if (!alive) return;
      if (inFlight) {
        again = true;
        return;
      }
      clear();
      inFlight = true;
      const sent = Date.now();
      const sep = url!.includes("?") ? "&" : "?";
      const r = await apiFetch<T>(version === null ? url! : `${url}${sep}since=${version}`);
      const received = Date.now();
      inFlight = false;
      if (!alive) return;
      if (r.ok) {
        setError(null);
        if (r.status !== 304 && r.data) {
          version = r.data.version;
          setOffset(r.data.now - (sent + received) / 2);
          setData(r.data);
        }
      } else {
        setError(r);
      }
      if (again) {
        again = false;
        return run();
      }
      if (document.visibilityState !== "hidden") timer = setTimeout(() => void run(), intervalMs);
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") void run();
      else clear();
    };
    control.current = {
      poll: () => void run(),
      reset: () => {
        version = null;
        void run();
      },
    };
    document.addEventListener("visibilitychange", onVisibility);
    void run();
    return () => {
      alive = false;
      clear();
      control.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [url, intervalMs]);

  /** Polls now (§10.5: once immediately after every mutation). */
  const refresh = useCallback(() => control.current?.poll(), []);
  /** Forces a full refetch (drops `since`), e.g. after a 409. */
  const reset = useCallback(() => control.current?.reset(), []);

  return { data, error, offset, refresh, reset };
}

/** Server-aligned clock that re-renders every `tickMs`. */
export function useServerNow(offset: number, tickMs = 250): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), tickMs);
    return () => clearInterval(id);
  }, [offset, tickMs]);
  return now;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
