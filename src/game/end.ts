import type { GameCtx } from "./context";
import { accrueActivity } from "./activity";
import { indexPuzzle } from "./puzzle";
import { scoreGame } from "./score";
import type { GameResult, RoomState } from "./types";

/** Ends the game when every word on every board is locked (§3.12). Mutates `state`. */
export function endGameIfComplete(state: RoomState, ctx: GameCtx, now: number): boolean {
  if (state.status !== "playing") return false;
  if (state.locked.length < indexPuzzle(ctx.puzzle).totalClues) return false;
  state.status = "ended";
  state.endedAt = now;
  state.pendingRotation = null;
  for (const [pid, p] of Object.entries(state.players)) {
    state.players[pid] = accrueActivity(p, state, now, ctx.cfg);
  }
  state.result = computeResult(state, ctx);
  return true;
}

export function computeResult(state: RoomState, ctx: GameCtx): GameResult {
  const started = state.timerStartedAt ?? state.createdAt;
  const ended = state.endedAt ?? started;
  const gameSeconds = Math.max(0, (ended - started) / 1000);
  const activeTotal = Object.values(state.players).reduce((sum, p) => sum + p.activeSeconds, 0);
  // effPlayers is floored at 1: the team is never "less than one player" (see DECISIONS.md).
  const effPlayers = gameSeconds > 0 ? Math.max(1, activeTotal / gameSeconds) : 1;
  const metaSolved = state.metaSolvedAt !== null && state.metaSolvedAt <= ended;
  const score = scoreGame({
    gameSeconds,
    parMinutes: ctx.puzzle.parMinutes,
    refPlayers: ctx.cfg.refPlayers,
    effPlayers,
    tokensSpent: state.stats.tokensSpent,
    tokensIssued: state.tokensIssued,
    falseSuspects: state.stats.falseSuspects,
    metaSolved,
  });
  return {
    total: score.total,
    grade: score.grade,
    breakdown: score.breakdown,
    details: {
      gameSeconds: Math.round(gameSeconds),
      parSeconds: Math.round(score.parSeconds),
      effPlayers: Math.round(effPlayers * 100) / 100,
      tokensSpent: state.stats.tokensSpent,
      tokensIssued: state.tokensIssued,
      falseSuspects: state.stats.falseSuspects,
      metaSolved,
    },
  };
}
