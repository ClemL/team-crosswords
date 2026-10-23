"use client";

import { useEffect, useState } from "react";
import { applyTheme, readTheme, type ThemeChoice } from "@/client/theme";
import ui from "./ui.module.css";

const NEXT: Record<ThemeChoice, ThemeChoice> = { auto: "light", light: "dark", dark: "auto" };
const LABEL: Record<ThemeChoice, string> = { auto: "🌓 Auto", light: "☀️ Light", dark: "🌙 Dark" };

/** Cycles the color theme: Auto (system) → Light → Dark. */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage once
    setChoice(readTheme());
  }, []);
  const current = choice ?? "auto";
  return (
    <button
      type="button"
      className={ui.btn}
      onClick={() => {
        const next = NEXT[current];
        applyTheme(next);
        setChoice(next);
      }}
      aria-label={`Color theme: ${current}. Switch to ${NEXT[current]}`}
      suppressHydrationWarning
    >
      {LABEL[current]}
    </button>
  );
}
