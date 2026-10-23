"use client";

import type { BoardView, ClueView } from "@/game/views";
import s from "./play.module.css";

export function clueLabel(clue: ClueView): string {
  return `${clue.num}${clue.dir}`;
}

function ClueText({ clue }: { clue: ClueView }) {
  const hidden = !clue.unlocked && clue.state !== "locked";
  return (
    <>
      {hidden && <span aria-label="locked clue">🔒 </span>}
      {clue.state === "locked" && <span aria-label="solved">✓ </span>}
      <strong>{clueLabel(clue)}</strong>{" "}
      <span className={hidden ? s.mask : undefined}>{clue.text}</span> ({clue.length})
    </>
  );
}

export function ClueBarText({ clue }: { clue: ClueView | undefined }) {
  if (!clue) return <span>Select a cell</span>;
  return (
    <>
      <span className={s.clueBarMain}>
        ▸ <ClueText clue={clue} />
      </span>
      {clue.condition && <span className={s.clueBarCondition}>{clue.condition}</span>}
    </>
  );
}

export function ClueList({
  board,
  activeId,
  onPick,
}: {
  board: BoardView;
  activeId: string | undefined;
  onPick: (clue: ClueView) => void;
}) {
  return (
    <div className={s.clueList}>
      {(["A", "D"] as const).map((dir) => (
        <section key={dir} aria-label={dir === "A" ? "Across" : "Down"}>
          <h3 className={s.clueHeading}>{dir === "A" ? "ACROSS" : "DOWN"}</h3>
          {board.clues
            .filter((c) => c.dir === dir)
            .sort((a, b) => a.num - b.num)
            .map((clue) => (
              <button
                key={clue.id}
                type="button"
                data-clue={clue.id}
                className={[
                  s.clueItem,
                  clue.id === activeId && s.clueItemActive,
                  clue.state === "locked" && s.clueItemLocked,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onPick(clue)}
              >
                <ClueText clue={clue} />
                {clue.condition && <span className={s.clueCondition}>{clue.condition}</span>}
              </button>
            ))}
        </section>
      ))}
    </div>
  );
}
