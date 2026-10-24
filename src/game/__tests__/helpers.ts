import { readFileSync } from "node:fs";
import path from "node:path";
import { CONFIG_V1, type GameConfig } from "@/config";
import type { GameCtx } from "../context";
import { joinRoom, markReady } from "../lobby";
import { cellKey, splitPuzzle } from "../puzzle";
import { mulberry32 } from "../rng";
import { createRoomState } from "../state";
import type { PuzzleGame, RoomState } from "../types";

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

export function fillBoard(s: RoomState, ctx: GameCtx, board: number): void {
  ctx.solution.boards[board].forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch !== "#") s.boards[board].entries[cellKey(r, c)] = ch;
    });
  });
}
