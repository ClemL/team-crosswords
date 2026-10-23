import type { BoardView, ClueView } from "@/game/views";
import type { Dir } from "@/game/types";

export type Selection = { r: number; c: number; dir: Dir };

export const key = (r: number, c: number) => `${r},${c}`;

export function isOpenCell(layout: string[], r: number, c: number): boolean {
  return layout[r]?.[c] === ".";
}

export function clueAt(board: BoardView, r: number, c: number, dir: Dir): ClueView | undefined {
  return board.clues.find(
    (cl) => cl.dir === dir && cl.cells.some(([cr, cc]) => cr === r && cc === c),
  );
}

/** First cell of the board (reading order) that is open and not locked; else the first open cell. */
export function defaultSelection(board: BoardView): Selection {
  const locked = new Set(board.lockedCells);
  let first: Selection | null = null;
  for (let r = 0; r < board.layout.length; r++) {
    for (let c = 0; c < board.layout[r].length; c++) {
      if (!isOpenCell(board.layout, r, c)) continue;
      first ??= { r, c, dir: "A" };
      if (!locked.has(key(r, c))) return { r, c, dir: clueAt(board, r, c, "A") ? "A" : "D" };
    }
  }
  return first ?? { r: 0, c: 0, dir: "A" };
}

/** Next non-locked cell after (r, c) within the word, or null. */
export function nextInWord(
  clue: ClueView,
  r: number,
  c: number,
  locked: Set<string>,
): [number, number] | null {
  const i = clue.cells.findIndex(([cr, cc]) => cr === r && cc === c);
  for (let j = i + 1; j < clue.cells.length; j++) {
    const [nr, nc] = clue.cells[j];
    if (!locked.has(key(nr, nc))) return [nr, nc];
  }
  return null;
}

/** Previous non-locked cell before (r, c) within the word, or null. */
export function prevInWord(
  clue: ClueView,
  r: number,
  c: number,
  locked: Set<string>,
): [number, number] | null {
  const i = clue.cells.findIndex(([cr, cc]) => cr === r && cc === c);
  for (let j = i - 1; j >= 0; j--) {
    const [nr, nc] = clue.cells[j];
    if (!locked.has(key(nr, nc))) return [nr, nc];
  }
  return null;
}

/** Tapping a clue selects its first empty, non-locked cell (else its first non-locked cell). */
export function firstEmptyInWord(
  clue: ClueView,
  entries: Record<string, string>,
  locked: Set<string>,
): [number, number] {
  const open = clue.cells.filter(([r, c]) => !locked.has(key(r, c)));
  const empty = open.find(([r, c]) => !entries[key(r, c)]);
  return empty ?? open[0] ?? clue.cells[0];
}

/** Arrow-key movement to the next open cell in a direction, skipping black cells. */
export function moveBy(
  layout: string[],
  r: number,
  c: number,
  dr: number,
  dc: number,
): [number, number] {
  let nr = r + dr;
  let nc = c + dc;
  while (nr >= 0 && nc >= 0 && nr < layout.length && nc < (layout[nr]?.length ?? 0)) {
    if (isOpenCell(layout, nr, nc)) return [nr, nc];
    nr += dr;
    nc += dc;
  }
  return [r, c];
}

/** Clues in display order: across then down, by number. */
export function orderedClues(board: BoardView): ClueView[] {
  return [...board.clues].sort((a, b) =>
    a.dir === b.dir ? a.num - b.num : a.dir === "A" ? -1 : 1,
  );
}

export function isWordFilled(clue: ClueView, entries: Record<string, string>): boolean {
  return clue.cells.every(([r, c]) => !!entries[key(r, c)]);
}
