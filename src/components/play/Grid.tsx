"use client";

import type { BoardView } from "@/game/views";
import { clueAt, key, type Selection } from "@/client/board-nav";
import { metaLabel } from "../MetaBar";
import ui from "../ui.module.css";
import s from "./play.module.css";

export function Grid({
  board,
  entries,
  pendingKeys,
  sel,
  fresh,
  onCell,
}: {
  board: BoardView;
  entries: Record<string, string>;
  pendingKeys: Set<string>;
  sel: Selection;
  fresh: Set<string>;
  onCell: (r: number, c: number) => void;
}) {
  const n = board.layout.length;
  const locked = new Set(board.lockedCells);
  const metaAt = new Map(board.metaCells.map((m) => [key(m.r, m.c), m]));
  const helperAt = new Map(board.helperCells.map((h) => [key(h.r, h.c), h.boards]));
  const numbers = new Map<string, number>();
  for (const clue of board.clues) numbers.set(key(clue.cells[0][0], clue.cells[0][1]), clue.num);
  const word = clueAt(board, sel.r, sel.c, sel.dir);
  const inWord = new Set(word?.cells.map(([r, c]) => key(r, c)) ?? []);

  return (
    <div className={s.gridWrap}>
      <div
        className={s.grid}
        style={{ "--n": n } as React.CSSProperties}
        role="group"
        aria-label={`Board ${board.emoji}, ${n} by ${n}`}
      >
        {board.layout.flatMap((row, r) =>
          [...row].map((ch, c) => {
            const k = key(r, c);
            if (ch !== ".")
              return <div key={k} className={`${s.cell} ${s.black}`} aria-hidden="true" />;
            const letter = entries[k] ?? "";
            const isLocked = locked.has(k);
            const isSel = sel.r === r && sel.c === c;
            const classes = [
              s.cell,
              metaAt.has(k) && s.shaded,
              metaAt.has(k) && ui[`m${metaAt.get(k)!.meta}`],
              helperAt.has(k) && !isLocked && s.helper,
              inWord.has(k) && s.inWord,
              isSel && s.selected,
              isLocked && s.locked,
              isLocked && fresh.has(k) && s.justLocked,
              pendingKeys.has(k) && s.pending,
            ]
              .filter(Boolean)
              .join(" ");
            const suspect = board.suspects[k];
            const label = [
              `Row ${r + 1}, column ${c + 1}`,
              letter ? `letter ${letter}` : "empty",
              isLocked && "locked",
              suspect && `suspected by ${suspect}`,
              metaAt.has(k) &&
                `meta word ${metaLabel(metaAt.get(k)!.meta)}, letter ${metaAt.get(k)!.slot}`,
              helperAt.has(k) && `unlocks a clue on ${helperAt.get(k)!.join(" ")}`,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <button
                key={k}
                type="button"
                className={classes}
                aria-label={label}
                aria-pressed={isSel}
                onClick={() => onCell(r, c)}
              >
                {numbers.has(k) && <span className={s.num}>{numbers.get(k)}</span>}
                {suspect && !isLocked && <span className={s.suspect}>?{suspect}</span>}
                {metaAt.has(k) && (
                  <span className={s.metaTag}>{metaLabel(metaAt.get(k)!.meta)}</span>
                )}
                {helperAt.has(k) && !isLocked && (
                  <span className={s.helperTag} aria-hidden="true">
                    {helperAt.get(k)!.join("")}
                  </span>
                )}
                {letter}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
