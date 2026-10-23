"use client";

import { useState } from "react";
import type { MetaView, MetaWordView } from "@/game/views";
import { Modal } from "./Modal";
import ui from "./ui.module.css";

const metaClass = (n: number) => ui[`m${((n - 1) % 5) + 1}`];

function statusText(w: MetaWordView): string {
  if (w.solved)
    return `Solved after ${w.rotations} rotation${w.rotations === 1 ? "" : "s"}: +${w.points} pts`;
  if (w.autoCompleted) return "Revealed at the end: 0 pts";
  return `${w.enumeration}`;
}

/** Every meta word with its letter slots (labeled by board emoji) and status. */
export function MetaWordList({ meta }: { meta: MetaView }) {
  return (
    <div className={ui.metaList}>
      {meta.words.map((w) => (
        <div key={w.id} className={`${ui.metaWord} ${metaClass(w.number)}`}>
          <span className={ui.metaNum} aria-label={`Meta word ${w.number}`}>
            {w.number}
          </span>
          <div className={ui.metaSlots}>
            {w.slots.map((s, i) => (
              <div key={i} className={ui.metaSlot}>
                <span aria-hidden="true">{s.emoji}</span>
                <span
                  className={[
                    ui.metaLetter,
                    s.letter && w.solved && ui.metaLetterOn,
                    s.letter && w.autoCompleted && ui.metaLetterAuto,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label={`Letter ${i + 1}: ${s.letter ?? "unknown"}`}
                >
                  {s.letter ?? ""}
                </span>
              </div>
            ))}
          </div>
          <span className={`${ui.metaStatus} ${w.solved ? ui.metaStatusSolved : ""}`}>
            {statusText(w)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** One compact chip per word, e.g. "C__N"; unknown letters are underscores. */
export function MetaChips({ meta }: { meta: MetaView }) {
  return (
    <span className={ui.metaChips}>
      {meta.words.map((w) => (
        <span
          key={w.id}
          className={[
            ui.metaChip,
            metaClass(w.number),
            w.solved && ui.metaChipSolved,
            w.autoCompleted && ui.metaChipAuto,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={`Meta word ${w.number}: ${w.slots.map((s) => s.letter ?? "blank").join(" ")}${w.solved ? ", solved" : ""}`}
        >
          {w.slots.map((s) => s.letter ?? "_").join("")}
        </span>
      ))}
    </span>
  );
}

type GuessResult = {
  correct: boolean;
  guessesLeft: number;
  metaId: string | null;
  points: number | null;
};

/**
 * Phone meta bar (§3.10, revised): a compact row of the 5 words. Tapping it opens the meta panel
 * with every word and a single guess box that is checked against all unsolved words.
 */
export function MetaBar({
  meta,
  onGuess,
  canGuess,
}: {
  meta: MetaView;
  onGuess?: (guess: string) => Promise<GuessResult | null>;
  canGuess: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const allSolved = meta.solvedCount === meta.words.length;
  const guessable = canGuess && !!onGuess && !allSolved && meta.guessesLeft > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onGuess || busy || !guess.trim()) return;
    setBusy(true);
    const r = await onGuess(guess);
    setBusy(false);
    if (!r) return;
    const word = meta.words.find((w) => w.id === r.metaId);
    setFeedback(
      r.correct
        ? { ok: true, text: `✓ Meta word ${word?.number ?? ""} solved: +${r.points} pts` }
        : {
            ok: false,
            text: `Not a meta word. ${r.guessesLeft} wrong ${r.guessesLeft === 1 ? "guess" : "guesses"} left.`,
          },
    );
    setGuess("");
  };

  return (
    <>
      <button
        type="button"
        className={ui.metaBar}
        onClick={() => {
          setFeedback(null);
          setOpen(true);
        }}
        aria-label={`Meta words: ${meta.solvedCount} of ${meta.words.length} solved. Open meta panel`}
      >
        <span className={ui.metaLabel}>META</span>
        <MetaChips meta={meta} />
        {onGuess && <span className={ui.metaGuessLabel}>{guessable ? "Guess ›" : "View ›"}</span>}
      </button>
      {open && (
        <Modal
          title={`Meta words · ${meta.solvedCount}/${meta.words.length} solved`}
          onClose={() => setOpen(false)}
        >
          <div className={ui.section}>
            <MetaWordList meta={meta} />
          </div>
          {onGuess && (
            <form className={ui.section} onSubmit={submit}>
              <p className={ui.muted} style={{ marginTop: 0 }}>
                One guess is checked against every unsolved word. A correct guess now earns{" "}
                {meta.pointsNow} of {meta.maxPointsPerWord} points (10% less per rotation). The team
                has {meta.guessesLeft} wrong {meta.guessesLeft === 1 ? "guess" : "guesses"} left.
              </p>
              <input
                className={ui.input}
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                maxLength={32}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                disabled={!guessable}
                aria-label="Meta guess"
              />
              {feedback && (
                <p
                  role="status"
                  style={{ color: feedback.ok ? "var(--green)" : "var(--red)", fontWeight: 600 }}
                >
                  {feedback.text}
                </p>
              )}
              <div className={ui.actions} style={{ marginTop: 12 }}>
                <button
                  type="submit"
                  className={`${ui.btn} ${ui.primary}`}
                  disabled={!guessable || busy || !guess.trim()}
                >
                  Submit guess
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
