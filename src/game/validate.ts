import { CONFIG_V1, type GameConfig } from "@/config";
import type { GameCtx } from "./context";
import { cellKey, splitPuzzle } from "./puzzle";
import { runPulse } from "./pulse";
import { mulberry32 } from "./rng";
import { createRoomState } from "./state";
import type { PuzzleBoard, PuzzleGame } from "./types";

export const MAX_SOLVE_ROTATIONS = 10;
const MIN_WORD = 3;
const MIN_BASE = 3;
const SHADED_PER_BOARD = 2;

export type ValidationReport = {
  id: string;
  errors: string[];
  warnings: string[];
  /** Rotations needed in the idealized solvability simulation, or null if not solvable. */
  solvedAtRotation: number | null;
};

function isBlack(layout: string[], r: number, c: number): boolean {
  return r < 0 || c < 0 || r >= layout.length || c >= layout[r].length || layout[r][c] !== ".";
}

/** Standard numbering: a cell gets a number if it starts an across or down run of length ≥ 2. */
function standardNumbers(layout: string[]): Map<string, number> {
  const nums = new Map<string, number>();
  let n = 0;
  for (let r = 0; r < layout.length; r++) {
    for (let c = 0; c < layout[r].length; c++) {
      if (isBlack(layout, r, c)) continue;
      const startsAcross = isBlack(layout, r, c - 1) && !isBlack(layout, r, c + 1);
      const startsDown = isBlack(layout, r - 1, c) && !isBlack(layout, r + 1, c);
      if (startsAcross || startsDown) nums.set(cellKey(r, c), ++n);
    }
  }
  return nums;
}

function validateBoard(game: PuzzleGame, board: PuzzleBoard, bi: number, errors: string[]): void {
  const at = `board ${bi}`;
  const size = game.boardSize;
  if (board.index !== bi) errors.push(`${at}: index is ${board.index}, expected ${bi}`);
  // 1. Shapes and black-cell agreement.
  const shapeOk = (rows: string[]) =>
    Array.isArray(rows) &&
    rows.length === size &&
    rows.every((row) => typeof row === "string" && row.length === size);
  if (!shapeOk(board.layout)) {
    errors.push(`${at}: layout is not ${size}×${size}`);
    return;
  }
  if (!shapeOk(board.solution)) {
    errors.push(`${at}: solution is not ${size}×${size}`);
    return;
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const l = board.layout[r][c];
      const s = board.solution[r][c];
      if (l !== "#" && l !== ".")
        errors.push(`${at}: layout r${r}c${c} has invalid character "${l}"`);
      if ((l === "#") !== (s === "#"))
        errors.push(`${at}: black cells differ between layout and solution at r${r}c${c}`);
      if (s !== "#" && !/^[A-Z]$/.test(s)) errors.push(`${at}: solution r${r}c${c} is not A–Z`);
    }
  }

  // 2–4. Clue geometry, answers, coverage, numbering.
  const across = new Map<string, number>();
  const down = new Map<string, number>();
  const nums = standardNumbers(board.layout);
  for (const clue of board.clues) {
    const where = `${at} clue ${clue.id}`;
    const cells = clue.cells;
    if (!Array.isArray(cells) || cells.length === 0) {
      errors.push(`${where}: no cells`);
      continue;
    }
    if (cells.length < MIN_WORD) errors.push(`${where}: word shorter than ${MIN_WORD} letters`);
    const [r0, c0] = cells[0];
    const contiguous = cells.every(([r, c], i) =>
      clue.dir === "A" ? r === r0 && c === c0 + i : c === c0 && r === r0 + i,
    );
    if (!contiguous)
      errors.push(
        `${where}: cells are not a contiguous ${clue.dir === "A" ? "across" : "down"} run`,
      );
    if (cells.some(([r, c]) => isBlack(board.layout, r, c)))
      errors.push(`${where}: covers a black or out-of-range cell`);
    if (contiguous) {
      const [rl, cl] = cells[cells.length - 1];
      const beforeOpen =
        clue.dir === "A" ? !isBlack(board.layout, r0, c0 - 1) : !isBlack(board.layout, r0 - 1, c0);
      const afterOpen =
        clue.dir === "A" ? !isBlack(board.layout, rl, cl + 1) : !isBlack(board.layout, rl + 1, cl);
      if (beforeOpen || afterOpen)
        errors.push(`${where}: run is not bounded by black cells or the edge`);
    }
    const letters = cells.map(([r, c]) => board.solution[r]?.[c] ?? "?").join("");
    if (letters !== clue.answer)
      errors.push(`${where}: answer "${clue.answer}" does not match solution "${letters}"`);
    const expectedNum = nums.get(cellKey(r0, c0));
    if (expectedNum !== clue.num)
      errors.push(`${where}: number ${clue.num} should be ${expectedNum ?? "none"}`);
    const cover = clue.dir === "A" ? across : down;
    for (const [r, c] of cells) cover.set(cellKey(r, c), (cover.get(cellKey(r, c)) ?? 0) + 1);
    if (typeof clue.text !== "string" || clue.text.trim() === "")
      errors.push(`${where}: empty clue text`);
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isBlack(board.layout, r, c)) continue;
      const k = cellKey(r, c);
      if ((across.get(k) ?? 0) !== 1)
        errors.push(`${at}: cell r${r}c${c} is covered by ${across.get(k) ?? 0} across clues`);
      if ((down.get(k) ?? 0) !== 1)
        errors.push(`${at}: cell r${r}c${c} is covered by ${down.get(k) ?? 0} down clues`);
    }
  }

  // 6. crossLetter references.
  for (const clue of board.clues) {
    const u = clue.unlock;
    if (u.type !== "crossLetter") continue;
    const where = `${at} clue ${clue.id}`;
    if (u.board === bi) errors.push(`${where}: crossLetter references its own board`);
    const target = game.boards[u.board];
    if (!Number.isInteger(u.board) || !target) {
      errors.push(`${where}: crossLetter references out-of-range board ${u.board}`);
      continue;
    }
    if (isBlack(target.layout, u.cell[0], u.cell[1]))
      errors.push(`${where}: crossLetter references a black cell`);
  }

  // 7. Shaded cells.
  if (!Array.isArray(board.shaded) || board.shaded.length !== SHADED_PER_BOARD) {
    errors.push(`${at}: expected exactly ${SHADED_PER_BOARD} shaded cells`);
  } else {
    const keys = new Set(board.shaded.map(([r, c]) => cellKey(r, c)));
    if (keys.size !== board.shaded.length) errors.push(`${at}: duplicate shaded cells`);
    for (const [r, c] of board.shaded) {
      if (isBlack(board.layout, r, c)) errors.push(`${at}: shaded cell r${r}c${c} is not open`);
    }
  }

  // 8. Base clues.
  const base = board.clues.filter((c) => c.unlock.type === "base").length;
  if (base < MIN_BASE) errors.push(`${at}: only ${base} base clues (minimum ${MIN_BASE})`);
}

/**
 * Solvability (§6.1.9): idealized pulse model using the real engine. Before each pulse every
 * unlocked clue is solved; a crossLetter source is correct once a word containing it is filled.
 */
export function simulateSolve(game: PuzzleGame, cfg: GameConfig = { ...CONFIG_V1 }): number | null {
  const { pub, solution } = splitPuzzle(game);
  const ctx: GameCtx = { puzzle: pub, solution, cfg: { ...cfg, seats: pub.boards.length } };
  let state = createRoomState({
    rid: "SIM",
    puzzle: pub,
    now: 0,
    rng: mulberry32(1),
    cfg: ctx.cfg,
  });
  state.status = "playing";
  state.timerStartedAt = 0;
  for (let rotation = 1; rotation <= MAX_SOLVE_ROTATIONS; rotation++) {
    for (const board of pub.boards) {
      for (const clue of board.clues) {
        if (!state.unlocked.includes(clue.id)) continue;
        for (const [r, c] of clue.cells) {
          state.boards[board.index].entries[cellKey(r, c)] = solution.boards[board.index][r][c];
        }
      }
    }
    const pulse = runPulse(state, ctx, rotation);
    state = pulse.state;
    state.rotations += 1;
    if (pulse.ended) return rotation;
  }
  return null;
}

export function validateGame(
  game: PuzzleGame,
  expectedBoards: number = CONFIG_V1.seats,
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const id = typeof game?.id === "string" ? game.id : "(missing id)";
  if (!Array.isArray(game?.boards) || game.boards.length !== expectedBoards) {
    errors.push(`expected ${expectedBoards} boards`);
    return { id, errors, warnings, solvedAtRotation: null };
  }
  if (!Number.isFinite(game.parMinutes) || game.parMinutes <= 0)
    errors.push("parMinutes must be positive");
  game.boards.forEach((b, bi) => validateBoard(game, b, bi, errors));

  // 5. Duplicate ids and answers within a game.
  const ids = new Set<string>();
  const answers = new Set<string>();
  for (const b of game.boards) {
    for (const c of b.clues) {
      if (ids.has(c.id)) errors.push(`duplicate clue id ${c.id}`);
      ids.add(c.id);
      if (answers.has(c.answer)) errors.push(`duplicate answer ${c.answer}`);
      answers.add(c.answer);
    }
  }

  // 7. Shaded letters spell the meta answer.
  const shadedLetters = game.boards
    .flatMap((b) =>
      (Array.isArray(b.shaded) ? b.shaded : []).map(([r, c]) => b.solution[r]?.[c] ?? "?"),
    )
    .join("");
  if (shadedLetters !== game.meta?.answer) {
    errors.push(
      `shaded letters "${shadedLetters}" do not spell meta answer "${game.meta?.answer}"`,
    );
  }

  // 9. Solvability (only meaningful once the structure is valid).
  let solvedAtRotation: number | null = null;
  if (errors.length === 0) {
    solvedAtRotation = simulateSolve(game);
    if (solvedAtRotation === null)
      errors.push(`not solvable within ${MAX_SOLVE_ROTATIONS} rotations`);
  }
  return { id, errors, warnings, solvedAtRotation };
}

export function validatePuzzleSet(games: PuzzleGame[]): ValidationReport[] {
  const reports = games.map((g) => validateGame(g));
  const seenIds = new Set<string>();
  const seenAnswers = new Map<string, string>();
  for (const [i, g] of games.entries()) {
    if (seenIds.has(g.id)) reports[i].errors.push(`duplicate game id ${g.id}`);
    seenIds.add(g.id);
    for (const b of g.boards ?? []) {
      for (const c of b.clues ?? []) {
        const prev = seenAnswers.get(c.answer);
        if (prev && prev !== g.id)
          reports[i].warnings.push(`answer ${c.answer} also appears in ${prev}`);
        else seenAnswers.set(c.answer, g.id);
      }
    }
  }
  return reports;
}
