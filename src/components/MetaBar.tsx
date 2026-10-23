"use client";

import { useState } from "react";
import type { MetaView, MetaWordView } from "@/game/views";
import { Modal } from "./Modal";
import ui from "./ui.module.css";

const metaClass = (n: number) => ui[`m${((n - 1) % 5) + 1}`];

function statusText(w: MetaWordView): string {
  if (!w.solved) return w.enumeration;
  const how =
    w.by === "guess" ? `guessed${w.guessedBy ? ` by ${w.guessedBy}` : ""}` : "completed by tiles";
  return `${how} after ${w.rotations} rotation${w.rotations === 1 ? "" : "s"}: +${w.points} pts`;
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
                  className={[ui.metaLetter, s.letter && w.solved && ui.metaLetterOn]
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
          className={[ui.metaChip, metaClass(w.number), w.solved && ui.metaChipSolved]
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

type GuessResult = { correct: boolean; metaId: string | null; points: number | null };
type YourGuess = { text: string; correct: boolean; metaNumber: number | null } | null;

/**
 * Phone meta bar (§3.10, revised): a compact row of the 5 words. Tapping it opens the meta panel
 * with every word and the player's single guess, checked against every word not yet obtained.
 */
export function MetaBar({
  meta,
  onGuess,
  canGuess,
  yourGuess = null,
}: {
  meta: MetaView;
  onGuess?: (guess: string) => Promise<GuessResult | null>;
  /** False once this player has used their one guess (or the game is not running). */
  canGuess: boolean;
  yourGuess?: YourGuess;
}) {
  const [open, setOpen] = useState(false);
  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const allSolved = meta.solvedCount === meta.words.length;
  const guessable = canGuess && !!onGuess && !allSolved;

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
        : { ok: false, text: "Not a meta word. Your guess is used." },
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
        {onGuess && <span className={ui.metaGuessLabel}>{guessable ? "Guess ›" : "Metas ›"}</span>}
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
                {yourGuess
                  ? `You guessed ${yourGuess.text}: ${
                      yourGuess.correct ? `right (word ${yourGuess.metaNumber})` : "not a meta word"
                    }. Each player gets one guess per game.`
                  : `You get one guess for the whole game, checked against every unsolved word; right or wrong, it is then used. Each word is worth ${meta.pointsNow} of ${meta.maxPointsPerWord} points now (10% less per rotation), whether it is guessed or its tiles are completed.`}
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
                  style={{
                    color: feedback.ok ? "var(--green-text)" : "var(--red)",
                    fontWeight: 600,
                  }}
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
