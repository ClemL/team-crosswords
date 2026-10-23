import type { GameCtx } from "./context";
import { accrueActivity } from "./activity";
import { cellKey } from "./puzzle";
import { metaPoints, scoreGame } from "./score";
import { lockedCellKeys } from "./state";
import type { BoardMvp, GameResult, MetaResult, PlayerCard, RoomState } from "./types";

/** True once every meta word has been obtained, by a guess or by its tiles. */
export function allMetasObtained(state: RoomState, ctx: GameCtx): boolean {
  return ctx.puzzle.metas.every((m) => state.metaSolved[m.id] !== undefined);
}

/**
 * Records every meta word whose cells are now all locked as obtained "by tiles" (mutates `state`).
 * Called inside a pulse, after locking, so `rotations` is the count before the current rotation.
 */
export function obtainMetasByTiles(state: RoomState, ctx: GameCtx, now: number): string[] {
  const lockedByBoard = ctx.puzzle.boards.map((_, bi) => lockedCellKeys(state, ctx, bi));
  const obtained: string[] = [];
  for (const m of ctx.puzzle.metas) {
    if (state.metaSolved[m.id]) continue;
    if (m.cells.every(([b, r, c]) => lockedByBoard[b].has(cellKey(r, c)))) {
      state.metaSolved[m.id] = { at: now, rotations: state.rotations, by: "tiles" };
      obtained.push(m.id);
    }
  }
  return obtained;
}

/** Ends the game once every meta word is obtained (revised §3.12). Mutates `state`. */
export function endGameIfComplete(state: RoomState, ctx: GameCtx, now: number): boolean {
  if (state.status !== "playing") return false;
  if (!allMetasObtained(state, ctx)) return false;
  state.status = "ended";
  state.endedAt = now;
  state.pendingRotation = null;
  for (const [pid, p] of Object.entries(state.players)) {
    state.players[pid] = accrueActivity(p, state, now, ctx.cfg);
  }
  state.result = computeResult(state, ctx);
  return true;
}

/** Tiles credited per player id and board: locked cells whose current letter the player typed. */
export function tileCredits(state: RoomState, ctx: GameCtx): Map<string, number[]> {
  const credits = new Map<string, number[]>();
  ctx.puzzle.boards.forEach((_, bi) => {
    for (const k of lockedCellKeys(state, ctx, bi)) {
      const author = state.boards[bi].authors[k];
      if (!author) continue;
      const row = credits.get(author) ?? ctx.puzzle.boards.map(() => 0);
      row[bi] += 1;
      credits.set(author, row);
    }
  });
  return credits;
}

function playerCards(state: RoomState, ctx: GameCtx): PlayerCard[] {
  const credits = tileCredits(state, ctx);
  const metaNumber = new Map(ctx.puzzle.metas.map((m, i) => [m.id, i + 1]));
  return Object.entries(state.players)
    .map(([pid, p]): PlayerCard => {
      const st = state.playerStats[pid];
      const byBoard = credits.get(pid) ?? ctx.puzzle.boards.map(() => 0);
      const g = st?.guess ?? null;
      return {
        seat: p.seat,
        name: p.name,
        initials: p.initials,
        tiles: byBoard.reduce((a, b) => a + b, 0),
        tilesByBoard: byBoard,
        lettersTyped: st?.lettersTyped ?? 0,
        rotations: st?.rotations ?? 0,
        falseSuspects: st?.falseSuspects ?? 0,
        accurateSuspects: st?.accurateSuspects ?? 0,
        activeSeconds: Math.round(p.activeSeconds),
        guess: g
          ? {
              text: g.text,
              correct: g.metaId !== null,
              metaNumber: g.metaId ? (metaNumber.get(g.metaId) ?? null) : null,
              points: g.metaId ? metaPoints(g.rotations, ctx.cfg) : 0,
            }
          : null,
      };
    })
    .sort((a, b) => a.seat - b.seat);
}

function boardMvps(state: RoomState, ctx: GameCtx, cards: PlayerCard[]): BoardMvp[] {
  return ctx.puzzle.boards.map((_, bi) => {
    const best = Math.max(0, ...cards.map((c) => c.tilesByBoard[bi]));
    const winners = best > 0 ? cards.filter((c) => c.tilesByBoard[bi] === best) : [];
    return {
      boardIndex: bi,
      emoji: state.boardEmojis[bi]?.e ?? "",
      seats: winners.map((w) => w.seat),
      names: winners.map((w) => w.name),
      tiles: best,
    };
  });
}

export function computeResult(state: RoomState, ctx: GameCtx): GameResult {
  const started = state.timerStartedAt ?? state.createdAt;
  const ended = state.endedAt ?? started;
  const gameSeconds = Math.max(0, (ended - started) / 1000);
  const activeTotal = Object.values(state.players).reduce((sum, p) => sum + p.activeSeconds, 0);
  // effPlayers is floored at 1: the team is never "less than one player" (see DECISIONS.md).
  const effPlayers = gameSeconds > 0 ? Math.max(1, activeTotal / gameSeconds) : 1;
  const nameAtSeat = new Map(Object.values(state.players).map((p) => [p.seat, p.name]));
  const metas: MetaResult[] = ctx.puzzle.metas.map((m) => {
    const got = state.metaSolved[m.id];
    const counted = got !== undefined && got.at <= ended;
    const result: MetaResult = {
      id: m.id,
      answer: ctx.solution.metaAnswers[m.id],
      by: counted ? got.by : null,
      rotations: counted ? got.rotations : null,
      points: counted ? metaPoints(got.rotations, ctx.cfg) : 0,
    };
    if (counted && got.by === "guess" && got.seat !== undefined)
      result.guessedBy = nameAtSeat.get(got.seat);
    return result;
  });
  const score = scoreGame({
    gameSeconds,
    parMinutes: ctx.puzzle.parMinutes,
    refPlayers: ctx.cfg.refPlayers,
    effPlayers,
    falseSuspects: state.stats.falseSuspects,
    metaPoints: metas.reduce((sum, m) => sum + m.points, 0),
  });
  const players = playerCards(state, ctx);
  return {
    total: score.total,
    grade: score.grade,
    breakdown: score.breakdown,
    details: {
      gameSeconds: Math.round(gameSeconds),
      parSeconds: Math.round(score.parSeconds),
      effPlayers: Math.round(effPlayers * 100) / 100,
      falseSuspects: state.stats.falseSuspects,
      metas,
    },
    players,
    mvps: boardMvps(state, ctx, players),
    leaderboard: [...players]
      .sort((a, b) => b.tiles - a.tiles || a.seat - b.seat)
      .map((p) => ({ seat: p.seat, name: p.name, tiles: p.tiles })),
  };
}
