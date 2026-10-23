import type {
  Cell,
  PublicBoard,
  PublicClue,
  PublicPuzzle,
  PuzzleGame,
  PuzzleSolution,
} from "./types";

export const cellKey = (r: number, c: number): string => `${r},${c}`;

export function parseCellKey(key: string): Cell {
  const [r, c] = key.split(",").map(Number);
  return [r, c];
}

export function isOpen(board: { layout: string[] }, r: number, c: number): boolean {
  const row = board.layout[r];
  return row !== undefined && c >= 0 && c < row.length && row[c] === ".";
}

/** Split a puzzle file entry into the public part and the server-only solution. */
export function splitPuzzle(game: PuzzleGame): { pub: PublicPuzzle; solution: PuzzleSolution } {
  const pub: PublicPuzzle = {
    id: game.id,
    title: game.title,
    version: game.version,
    boardSize: game.boardSize,
    parMinutes: game.parMinutes,
    meta: { enumeration: game.meta.enumeration },
    boards: game.boards.map((b) => ({
      index: b.index,
      layout: [...b.layout],
      shaded: b.shaded.map(([r, c]) => [r, c] as Cell),
      clues: b.clues.map((c) => ({
        id: c.id,
        num: c.num,
        dir: c.dir,
        cells: c.cells.map(([r, cc]) => [r, cc] as Cell),
        text: c.text,
        unlock: c.unlock,
      })),
    })),
  };
  const solution: PuzzleSolution = {
    boards: game.boards.map((b) => [...b.solution]),
    metaAnswer: game.meta.answer,
  };
  return { pub, solution };
}

type BoardIndex = {
  clueById: Map<string, PublicClue>;
  /** "r,c" -> ids of the clues covering the cell */
  cluesByCell: Map<string, string[]>;
  openCells: string[];
};

export type PuzzleIndex = {
  boards: BoardIndex[];
  clueById: Map<string, { board: number; clue: PublicClue }>;
  totalClues: number;
};

const indexCache = new WeakMap<PublicPuzzle, PuzzleIndex>();

/** Lookup tables derived from a public puzzle (cached per puzzle object). */
export function indexPuzzle(puzzle: PublicPuzzle): PuzzleIndex {
  const cached = indexCache.get(puzzle);
  if (cached) return cached;
  const clueById = new Map<string, { board: number; clue: PublicClue }>();
  let totalClues = 0;
  const boards = puzzle.boards.map((b: PublicBoard, bi: number): BoardIndex => {
    const byId = new Map<string, PublicClue>();
    const byCell = new Map<string, string[]>();
    const openCells: string[] = [];
    b.layout.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === ".") openCells.push(cellKey(r, c));
    });
    for (const clue of b.clues) {
      byId.set(clue.id, clue);
      clueById.set(clue.id, { board: bi, clue });
      totalClues++;
      for (const [r, c] of clue.cells) {
        const k = cellKey(r, c);
        const list = byCell.get(k) ?? [];
        list.push(clue.id);
        byCell.set(k, list);
      }
    }
    return { clueById: byId, cluesByCell: byCell, openCells };
  });
  const idx = { boards, clueById, totalClues };
  indexCache.set(puzzle, idx);
  return idx;
}

export function solutionLetter(
  solution: PuzzleSolution,
  board: number,
  r: number,
  c: number,
): string {
  return solution.boards[board]?.[r]?.[c] ?? "#";
}
