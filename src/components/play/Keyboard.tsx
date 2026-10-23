"use client";

import s from "./play.module.css";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

/**
 * Custom on-screen keyboard (§9.4): the grid never focuses a native input. On the board the wide
 * key left of Z is the suspect mark; in the meta panel it is Enter, which submits the guess.
 */
export function Keyboard({
  onLetter,
  onBackspace,
  onSuspect,
  suspectActive = false,
  onEnter,
  enterLabel = "Enter",
  disabled,
}: {
  onLetter: (l: string) => void;
  onBackspace: () => void;
  onSuspect?: () => void;
  suspectActive?: boolean;
  onEnter?: () => void;
  enterLabel?: string;
  disabled: boolean;
}) {
  // Keys act on pointerdown-free click so the page never scrolls or zooms on double tap.
  return (
    <div className={s.keyboard} role="group" aria-label="Keyboard">
      {ROWS.map((row, i) => (
        <div key={row} className={s.keyRow}>
          {i === 2 && onSuspect && (
            <button
              type="button"
              className={`${s.key} ${s.keyWide} ${suspectActive ? s.keyActive : ""}`}
              onClick={onSuspect}
              disabled={disabled}
              aria-label="Toggle suspect mark"
              aria-pressed={suspectActive}
            >
              <span>?</span>
            </button>
          )}
          {i === 2 && !onSuspect && onEnter && (
            <button
              type="button"
              className={`${s.key} ${s.keyEnter}`}
              onClick={onEnter}
              disabled={disabled}
            >
              <span>{enterLabel}</span>
            </button>
          )}
          {[...row].map((l) => (
            <button
              key={l}
              type="button"
              className={s.key}
              onClick={() => onLetter(l)}
              disabled={disabled}
            >
              <span>{l}</span>
            </button>
          ))}
          {i === 2 && (
            <button
              type="button"
              className={`${s.key} ${s.keyWide}`}
              onClick={onBackspace}
              disabled={disabled}
              aria-label="Backspace"
            >
              <span>⌫</span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
