import type { GameConfig } from "@/config";
import type { GameCtx } from "./context";
import { endGameIfComplete, endGameIfNobodyLeft } from "./end";
import { fail, type Result } from "./errors";
import { guardInGame, guardPlayer, guardPlaying } from "./guards";
import { assignMaster, pickNextMaster } from "./master";
import { cellKey, solutionLetter } from "./puzzle";
import { metaPoints } from "./score";
import { cloneState, inGame, isSinglePlayer, lockedCellKeys, statsFor } from "./state";
import type { RoomState } from "./types";

export function normalizeGuess(guess: string): string {
  return guess.toUpperCase().replace(/[^A-Z]/g, "");
}

/**
 * Whether the player may guess. Alone: until a guess is wrong. With others: one guess each
 * (metaGuessesPerPlayer), and a knocked-out player has none.
 */
export function hasGuessLeft(state: RoomState, pid: string, cfg: GameConfig): boolean {
  if (!inGame(state, pid)) return false;
  const guesses = state.playerStats[pid]?.guesses ?? [];
  if (isSinglePlayer(state)) return guesses.every((g) => g.metaId !== null);
  return guesses.length < cfg.metaGuessesPerPlayer;
}

/**
 * Knocks a player out after a wrong multiplayer guess (mutates `state`). They can no longer type,
 * mark cells, guess or be Capt., and their active time stops counting. The Capt. role passes on,
 * and the game ends once nobody is left in it.
 */
export function knockOut(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  now: number,
  rng: () => number,
): void {
  state.knockedOut[pid] = now;
  if (state.masterPid === pid) {
    const next = pickNextMaster(state, now, rng, ctx.cfg);
    if (next && next !== pid) assignMaster(state, next);
  }
  endGameIfNobodyLeft(state, ctx, now);
}

/**
 * Meta guess (revised §3.10), checked against every meta word not yet obtained. A correct guess
 * obtains the word at the current rotation count; obtaining the last word ends the game.
 * Alone, a player keeps guessing until a guess is wrong. With others, each player gets one guess
 * and a wrong one knocks them out of the game.
 */
export function guessMeta(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  guess: string,
  now: number,
  rng: () => number,
): Result<{
  state: RoomState;
  correct: boolean;
  metaId: string | null;
  points: number | null;
  knockedOut: boolean;
}> {
  const g = guardPlayer(state, pid) ?? guardPlaying(state) ?? guardInGame(state, pid);
  if (g) return g;
  const solo = isSinglePlayer(state);
  if (!hasGuessLeft(state, pid, ctx.cfg))
    return fail(
      "NO_GUESSES",
      solo
        ? "Your last guess was wrong, so you have no guesses left."
        : "You have used your guess.",
    );
  const normalized = normalizeGuess(guess);
  if (normalized === "") return fail("BAD_REQUEST", "Enter a guess.");
  const match = ctx.puzzle.metas
    .map((m) => m.id)
    .find((id) => normalizeGuess(ctx.solution.metaAnswers[id] ?? "") === normalized);
  // A word that is already obtained is fully shown, so guessing it would waste the guess.
  if (match && state.metaSolved[match]) return fail("BAD_REQUEST", "That word is already solved.");
  const next = cloneState(state);
  statsFor(next, pid).guesses.push({
    text: normalized,
    metaId: match ?? null,
    at: now,
    rotations: next.rotations,
  });
  if (!match) {
    next.stats.metaWrong += 1;
    if (!solo) knockOut(next, ctx, pid, now, rng);
    return { ok: true, state: next, correct: false, metaId: null, points: null, knockedOut: !solo };
  }
  next.metaSolved[match] = {
    at: now,
    rotations: next.rotations,
    by: "guess",
    seat: next.players[pid].seat,
  };
  endGameIfComplete(next, ctx, now);
  return {
    ok: true,
    state: next,
    correct: true,
    metaId: match,
    points: metaPoints(next.rotations, ctx.cfg, ctx.puzzle.metas.length),
    knockedOut: false,
  };
}

export type MetaSlot = { emoji: string; boardIndex: number; letter: string | null };

export type MetaWordState = {
  id: string;
  enumeration: string;
  slots: MetaSlot[];
  /** Obtained, by a guess or by all of its tiles locking. */
  solved: boolean;
  by: "guess" | "tiles" | null;
  /** Present once obtained. */
  answer?: string;
  rotations?: number;
  points?: number;
  /** Name of the player whose guess obtained it. */
  guessedBy?: string;
};

/**
 * Meta words for display. A slot shows its letter once a word containing that cell is locked;
 * an obtained word shows every letter and its answer, and so does every word once the game is
 * over (a game that ends with everyone knocked out can leave words unobtained).
 */
export function metaWords(state: RoomState, ctx: GameCtx): MetaWordState[] {
  const lockedByBoard = ctx.puzzle.boards.map((_, bi) => lockedCellKeys(state, ctx, bi));
  const nameAtSeat = new Map(Object.values(state.players).map((p) => [p.seat, p.name]));
  const over = state.status === "ended";
  return ctx.puzzle.metas.map((m) => {
    const got = state.metaSolved[m.id];
    const word: MetaWordState = {
      id: m.id,
      enumeration: m.enumeration,
      slots: m.cells.map(([b, r, c]) => ({
        emoji: state.boardEmojis[b]?.e ?? "",
        boardIndex: b,
        letter:
          got || over || lockedByBoard[b].has(cellKey(r, c))
            ? solutionLetter(ctx.solution, b, r, c)
            : null,
      })),
      solved: Boolean(got),
      by: got?.by ?? null,
    };
    if (over && !got) word.answer = ctx.solution.metaAnswers[m.id];
    if (got) {
      word.answer = ctx.solution.metaAnswers[m.id];
      word.rotations = got.rotations;
      word.points = metaPoints(got.rotations, ctx.cfg, ctx.puzzle.metas.length);
      if (got.by === "guess" && got.seat !== undefined) word.guessedBy = nameAtSeat.get(got.seat);
    }
    return word;
  });
}
