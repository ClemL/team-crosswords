import type { GameConfig } from "@/config";
import type { GameCtx } from "./context";
import { pickBoardEmojis } from "./emoji";
import { cellKey, indexPuzzle, solutionLetter } from "./puzzle";
import type { PlayerRecord, PublicClue, PublicPuzzle, RoomState } from "./types";

/** One player: no cooldown and instant rotations. Multiplayer: shrinking cooldown. */
export function isSinglePlayer(state: Pick<RoomState, "players">): boolean {
  return Object.keys(state.players).length <= 1;
}

/**
 * Cooldown that starts after a rotation or Final Check, given the rotations made so far:
 * none in single player; in multiplayer cooldownMs, shortened by cooldownStepMs per rotation.
 */
export function cooldownFor(
  state: Pick<RoomState, "players" | "rotations">,
  cfg: GameConfig,
): number {
  if (isSinglePlayer(state)) return 0;
  return Math.max(cfg.cooldownMinMs, cfg.cooldownMs - cfg.cooldownStepMs * state.rotations);
}

export function cloneState(s: RoomState): RoomState {
  return structuredClone(s);
}

export function createRoomState(args: {
  rid: string;
  puzzle: PublicPuzzle;
  now: number;
  rng: () => number;
  cfg: GameConfig;
}): RoomState {
  const { rid, puzzle, now, rng, cfg } = args;
  if (puzzle.boards.length !== cfg.seats) {
    throw new Error(
      `Puzzle ${puzzle.id} has ${puzzle.boards.length} boards; config expects ${cfg.seats}`,
    );
  }
  const baseClues = puzzle.boards.flatMap((b) =>
    b.clues.filter((c) => c.unlock.type === "base").map((c) => c.id),
  );
  return {
    rid,
    puzzleId: puzzle.id,
    status: "lobby",
    version: 0,
    createdAt: now,
    rotations: 0,
    cooldownUntil: 0,
    masterPid: null,
    pendingRotation: null,
    tokensIssued: 0,
    tokensLeft: 0,
    timerStartedAt: null,
    endedAt: null,
    metaSolved: {},
    metaGuessesLeft: cfg.metaGuesses,
    boardEmojis: pickBoardEmojis(puzzle.boards.length, rng),
    finalCheckAt: null,
    result: null,
    seats: Array.from({ length: cfg.seats }, () => null),
    boardAtSeat: Array.from({ length: cfg.seats }, (_, i) => i),
    players: {},
    masterCounts: {},
    ready: [],
    boards: puzzle.boards.map(() => ({ entries: {}, suspects: {}, red: [] })),
    locked: [],
    unlocked: baseClues,
    stats: { tokensSpent: 0, falseSuspects: 0, accurateSuspects: 0, metaWrong: 0 },
  };
}

export function seatOf(state: RoomState, pid: string): number | null {
  const p = state.players[pid];
  return p ? p.seat : null;
}

export function isActive(p: PlayerRecord, now: number, cfg: GameConfig): boolean {
  return now - p.lastSeen <= cfg.inactiveAfterMs;
}

export function lockedCellKeys(state: RoomState, ctx: GameCtx, board: number): Set<string> {
  const idx = indexPuzzle(ctx.puzzle).boards[board];
  const out = new Set<string>();
  for (const id of state.locked) {
    const clue = idx.clueById.get(id);
    if (clue) for (const [r, c] of clue.cells) out.add(cellKey(r, c));
  }
  return out;
}

export function isCellLocked(state: RoomState, ctx: GameCtx, board: number, key: string): boolean {
  const ids = indexPuzzle(ctx.puzzle).boards[board].cluesByCell.get(key) ?? [];
  return ids.some((id) => state.locked.includes(id));
}

export function isWordFilled(state: RoomState, board: number, clue: PublicClue): boolean {
  const entries = state.boards[board].entries;
  return clue.cells.every(([r, c]) => (entries[cellKey(r, c)] ?? "") !== "");
}

export function wrongCells(
  state: RoomState,
  ctx: GameCtx,
  board: number,
  clue: PublicClue,
): [number, number][] {
  const entries = state.boards[board].entries;
  return clue.cells.filter(
    ([r, c]) => entries[cellKey(r, c)] !== solutionLetter(ctx.solution, board, r, c),
  );
}

export function isWordCorrect(
  state: RoomState,
  ctx: GameCtx,
  board: number,
  clue: PublicClue,
): boolean {
  return wrongCells(state, ctx, board, clue).length === 0;
}

/** Lock a word green (mutates `state`): clears red and suspect marks on its cells (§3.9.4). */
export function lockWord(state: RoomState, board: number, clue: PublicClue): void {
  if (state.locked.includes(clue.id)) return;
  state.locked.push(clue.id);
  const b = state.boards[board];
  const keys = new Set(clue.cells.map(([r, c]) => cellKey(r, c)));
  for (const k of keys) delete b.suspects[k];
  b.red = b.red.filter((k) => !keys.has(k));
}

export function allCellsFilled(state: RoomState, ctx: GameCtx): boolean {
  const idx = indexPuzzle(ctx.puzzle);
  return idx.boards.every((b, bi) =>
    b.openCells.every((k) => (state.boards[bi].entries[k] ?? "") !== ""),
  );
}

export function boardPercent(state: RoomState, ctx: GameCtx, board: number): number {
  const clues = ctx.puzzle.boards[board].clues;
  const locked = clues.filter((c) => state.locked.includes(c.id)).length;
  return clues.length === 0 ? 0 : Math.floor((locked * 100) / clues.length);
}

export function boardLockedCount(state: RoomState, ctx: GameCtx, board: number): number {
  return ctx.puzzle.boards[board].clues.filter((c) => state.locked.includes(c.id)).length;
}

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase() ?? "")
    .join("");
}
