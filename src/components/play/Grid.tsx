"use client";

import type { BoardView } from "@/game/views";
import { clueAt, key, type Selection } from "@/client/board-nav";
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
  const red = new Set(board.red);
  const shaded = new Set(board.shaded.map(([r, c]) => key(r, c)));
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
              shaded.has(k) && s.shaded,
              inWord.has(k) && s.inWord,
              isSel && s.selected,
              red.has(k) && !isLocked && s.red,
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
              red.has(k) && !isLocked && "marked wrong",
              suspect && `suspected by ${suspect}`,
              shaded.has(k) && "meta cell",
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
                {letter}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
