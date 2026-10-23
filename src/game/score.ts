import type { Grade, ScoreBreakdown } from "./types";

export type ScoreInput = {
  /** Wall-clock seconds between timer start and game end. */
  gameSeconds: number;
  parMinutes: number;
  refPlayers: number;
  /** Σ(active seconds of each player) / game seconds. */
  effPlayers: number;
  falseSuspects: number;
  /** Sum of the points of meta words solved by guessing (see metaPoints). */
  metaPoints: number;
  /** True when every meta word was solved by guessing. */
  allMetasSolved: boolean;
};

export type ScoreOutput = {
  total: number;
  breakdown: ScoreBreakdown;
  grade: Grade;
  parSeconds: number;
};

const round1 = (x: number): number => Math.round(x * 10) / 10;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** par = parMinutes × sqrt(refPlayers / effPlayers), in seconds. */
export function parSeconds(parMinutes: number, refPlayers: number, effPlayers: number): number {
  const eff = effPlayers > 0 ? effPlayers : refPlayers;
  return parMinutes * 60 * Math.sqrt(refPlayers / eff);
}

/**
 * Points for one meta word guessed after `rotations` rotations: full value before any rotation,
 * minus `decay` of it per rotation, never below `minFraction` of it.
 */
export function metaPoints(
  rotations: number,
  cfg: { metaWordPoints: number; metaDecayPerRotation: number; metaMinFraction: number },
): number {
  const fraction = Math.max(cfg.metaMinFraction, 1 - cfg.metaDecayPerRotation * rotations);
  return round1(cfg.metaWordPoints * fraction);
}

export function gradeFor(
  total: number,
  input: Pick<ScoreInput, "falseSuspects" | "allMetasSolved">,
): Grade {
  if (total >= 95 && input.falseSuspects === 0 && input.allMetasSolved) return "S*";
  if (total >= 90) return "S";
  if (total >= 80) return "A";
  if (total >= 70) return "B";
  if (total >= 60) return "C";
  if (total >= 50) return "D";
  return "F";
}

/**
 * Time 50 + meta words 35 + suspect accuracy 15. Check tokens are not scored.
 * Components are rounded to one decimal; the grade is computed from the rounded total.
 */
export function scoreGame(input: ScoreInput): ScoreOutput {
  const par = parSeconds(input.parMinutes, input.refPlayers, input.effPlayers);
  const ratio = par > 0 ? input.gameSeconds / par : Number.POSITIVE_INFINITY;
  const time = round1(50 * clamp((3 - ratio) / 2, 0, 1));
  const metas = round1(input.metaPoints);
  const suspects = round1(Math.max(0, 15 - 3 * input.falseSuspects));
  const total = round1(time + metas + suspects);
  return {
    total,
    breakdown: { time, metas, suspects },
    grade: gradeFor(total, input),
    parSeconds: par,
  };
}
