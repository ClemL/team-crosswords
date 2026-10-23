"use client";

import { useState } from "react";
import type { MetaView } from "@/game/views";
import { Modal } from "./Modal";
import ui from "./ui.module.css";

/** §3.10 meta bar: 6 slots labeled by board emoji; a slot fills when its cell locks. */
export function MetaBar({
  meta,
  onGuess,
  canGuess,
}: {
  meta: MetaView;
  onGuess?: (guess: string) => Promise<{ correct: boolean; guessesLeft: number } | null>;
  canGuess: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onGuess || busy) return;
    setBusy(true);
    const r = await onGuess(guess);
    setBusy(false);
    if (!r) return;
    if (r.correct) {
      setOpen(false);
      setGuess("");
    } else {
      setFeedback(`Not it. ${r.guessesLeft} ${r.guessesLeft === 1 ? "guess" : "guesses"} left.`);
      setGuess("");
    }
  };

  return (
    <div className={ui.metaBar} aria-label="Meta word">
      <span className={ui.metaLabel}>META</span>
      <div className={ui.metaSlots}>
        {meta.slots.map((s, i) => (
          <div key={i} className={ui.metaSlot}>
            <span aria-hidden="true">{s.emoji}</span>
            <span
              className={`${ui.metaLetter} ${s.letter ? ui.metaLetterOn : ""}`}
              aria-label={`Slot ${i + 1}: ${s.letter ?? "unknown"}`}
            >
              {s.letter ?? ""}
            </span>
          </div>
        ))}
      </div>
      {meta.solved ? (
        <span className={ui.metaSolved}>✓ {meta.answer}</span>
      ) : onGuess ? (
        <button
          type="button"
          className={ui.btn}
          disabled={!canGuess || meta.guessesLeft <= 0}
          onClick={() => {
            setFeedback(null);
            setOpen(true);
          }}
        >
          Guess
        </button>
      ) : (
        <span className={ui.muted}>{meta.guessesLeft} left</span>
      )}
      {open && (
        <Modal title={`Guess the meta ${meta.enumeration}`} onClose={() => setOpen(false)}>
          <form className={ui.section} onSubmit={submit}>
            <p className={ui.muted} style={{ marginTop: 0 }}>
              The team has {meta.guessesLeft} wrong {meta.guessesLeft === 1 ? "guess" : "guesses"}{" "}
              left.
            </p>
            <input
              className={ui.input}
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              maxLength={32}
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              aria-label="Meta guess"
            />
            {feedback && (
              <p role="status" style={{ color: "var(--red)" }}>
                {feedback}
              </p>
            )}
            <div className={ui.actions} style={{ marginTop: 12 }}>
              <button
                type="submit"
                className={`${ui.btn} ${ui.primary}`}
                disabled={busy || !guess.trim()}
              >
                Submit
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
