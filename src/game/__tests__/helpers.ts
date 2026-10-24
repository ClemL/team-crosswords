import { readFileSync } from "node:fs";
import path from "node:path";
import { CONFIG_V1, type GameConfig } from "@/config";
import type { GameCtx } from "../context";
import { joinRoom, markReady } from "../lobby";
import { cellKey, splitPuzzle } from "../puzzle";
import { mulberry32 } from "../rng";
import { createRoomState } from "../state";
import type { BoardCell, PuzzleGame, RoomState } from "../types";

export const ALL_GAMES = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../../../data/puzzles-v1.json"), "utf8"),
) as PuzzleGame[];

/** The 6× set: three 6×6 boards and 6 meta words per game. */
export const SIX_GAMES = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../../../data/puzzles-6x.json"), "utf8"),
) as PuzzleGame[];

/** The 7× set: three 7×7 boards and 7 meta words per game, with a time limit. */
export const SEVEN_GAMES = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../../../data/puzzles-7x.json"), "utf8"),
) as PuzzleGame[];

export const GAME1 = ALL_GAMES[0];
export const PID = "p-1";
export const PID2 = "p-2";
export const T0 = 1_000_000;

export function makeCtx(game: PuzzleGame = GAME1, cfg: Partial<GameConfig> = {}): GameCtx {
  const { pub, solution } = splitPuzzle(game);
  return { puzzle: pub, solution, cfg: { ...CONFIG_V1, ...cfg } };
}

export function unwrap<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

/** A room with one joined player who is ready (timer started at T0). */
export function startedRoom(ctx: GameCtx, now: number = T0): RoomState {
  let s = createRoomState({
    rid: "TEST",
    puzzle: ctx.puzzle,
    now,
    rng: mulberry32(7),
    cfg: ctx.cfg,
  });
  s = unwrap(joinRoom(s, ctx, PID, "Clem Leung", now)).state;
  s = unwrap(markReady(s, ctx, PID, now)).state;
  return s;
}

/** Writes the solution letters of a clue straight into the state (mutates). */
/** A two-player room (multiplayer rules: cooldowns, rotation warning, one guess each). */
export function startedDuo(ctx: GameCtx, now: number = T0): RoomState {
  let s = createRoomState({
    rid: "DUO",
    puzzle: ctx.puzzle,
    now,
    rng: mulberry32(7),
    cfg: ctx.cfg,
  });
  s = unwrap(joinRoom(s, ctx, PID, "Clem Leung", now)).state;
  s = unwrap(joinRoom(s, ctx, PID2, "Kris", now)).state;
  s = unwrap(markReady(s, ctx, PID, now)).state;
  s = unwrap(markReady(s, ctx, PID2, now)).state;
  return s;
}

export function fillWord(
  s: RoomState,
  ctx: GameCtx,
  board: number,
  clueId: string,
  override?: string,
): void {
  const clue = ctx.puzzle.boards[board].clues.find((c) => c.id === clueId);
  if (!clue) throw new Error(`no clue ${clueId}`);
  clue.cells.forEach(([r, c], i) => {
    s.boards[board].entries[cellKey(r, c)] = override?.[i] ?? ctx.solution.boards[board][r][c];
  });
}

/** Every board index of the game, in ring order. */
export function boardIndexes(ctx: GameCtx): number[] {
  return ctx.puzzle.boards.map((b) => b.index);
}

/** Open cells of `board`. */
export function openCells(ctx: GameCtx, board: number): number {
  return ctx.solution.boards[board].join("").replace(/#/g, "").length;
}

/** For each cell of a meta word: its board and the across clue through it. */
export function metaTiles(ctx: GameCtx, metaId: string): [board: number, clueId: string][] {
  const meta = ctx.puzzle.metas.find((m) => m.id === metaId);
  if (!meta) throw new Error(`no meta ${metaId}`);
  return meta.cells.map(([b, r, c]) => {
    const clue = ctx.puzzle.boards[b].clues.find(
      (cl) => cl.dir === "A" && cl.cells.some(([cr, cc]) => cr === r && cc === c),
    );
    if (!clue) throw new Error(`no across clue through b${b} r${r}c${c}`);
    return [b, clue.id];
  });
}

/**
 * Puts a wrong letter in the first cell of a meta word (on `board`, if given) (mutates), so that
 * word, and the across and down words through the cell, stay open. Returns the cell.
 */
export function breakMetaCell(
  s: RoomState,
  ctx: GameCtx,
  metaId = "M5",
  board?: number,
): BoardCell {
  const cells = ctx.puzzle.metas.find((m) => m.id === metaId)!.cells;
  const cell = cells.find(([b]) => board === undefined || b === board);
  if (!cell) throw new Error(`${metaId} has no cell on board ${board}`);
  const [b, r, c] = cell;
  s.boards[b].entries[cellKey(r, c)] = ctx.solution.boards[b][r][c] === "Q" ? "Z" : "Q";
  return cell;
}

/** Fills every board with its solution (mutates). */
export function fillAll(s: RoomState, ctx: GameCtx): void {
  for (const b of boardIndexes(ctx)) fillBoard(s, ctx, b);
}

export function fillBoard(s: RoomState, ctx: GameCtx, board: number): void {
  ctx.solution.boards[board].forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch !== "#") s.boards[board].entries[cellKey(r, c)] = ch;
    });
  });
}
