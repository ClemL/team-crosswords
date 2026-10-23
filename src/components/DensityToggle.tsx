"use client";

import { useEffect, useState } from "react";
import { applyDensity, readDensity, type DensityChoice } from "@/client/density";
import ui from "./ui.module.css";

const NEXT: Record<DensityChoice, DensityChoice> = {
  normal: "cosy",
  cosy: "compact",
  compact: "normal",
};
const LABEL: Record<DensityChoice, string> = {
  normal: "Aa Normal",
  cosy: "Aa Cosy",
  compact: "Aa Compact",
};

/** Cycles the display density, for text and controls alike: Normal → Cosy → Compact. */
export function DensityToggle() {
  const [choice, setChoice] = useState<DensityChoice | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage once
    setChoice(readDensity());
  }, []);
  const current = choice ?? "normal";
  return (
    <button
      type="button"
      className={ui.btn}
      onClick={() => {
        const next = NEXT[current];
        applyDensity(next);
        setChoice(next);
      }}
      aria-label={`Display size: ${current}. Switch to ${NEXT[current]}`}
      suppressHydrationWarning
    >
      {LABEL[current]}
    </button>
  );
}
