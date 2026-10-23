import type { Grade, ScoreBreakdown } from "./types";

export type ScoreInput = {
  /** Wall-clock seconds between timer start and game end. */
  gameSeconds: number;
  parMinutes: number;
  refPlayers: number;
  /** Σ(active seconds of each player) / game seconds. */
  effPlayers: number;
  tokensSpent: number;
  tokensIssued: number;
  falseSuspects: number;
  metaSolved: boolean;
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

export function gradeFor(
  total: number,
  input: Pick<ScoreInput, "tokensSpent" | "falseSuspects" | "metaSolved">,
): Grade {
  if (total >= 95 && input.tokensSpent === 0 && input.falseSuspects === 0 && input.metaSolved)
    return "S*";
  if (total >= 90) return "S";
  if (total >= 80) return "A";
  if (total >= 70) return "B";
  if (total >= 60) return "C";
  if (total >= 50) return "D";
  return "F";
}

/** §4. Components are rounded to one decimal; the grade is computed from the rounded total. */
export function scoreGame(input: ScoreInput): ScoreOutput {
  const par = parSeconds(input.parMinutes, input.refPlayers, input.effPlayers);
  const ratio = par > 0 ? input.gameSeconds / par : Number.POSITIVE_INFINITY;
  const time = round1(50 * clamp((3 - ratio) / 2, 0, 1));
  const tokens = round1(
    input.tokensIssued > 0 ? 25 * (1 - input.tokensSpent / input.tokensIssued) : 25,
  );
  const suspects = round1(Math.max(0, 15 - 3 * input.falseSuspects));
  const meta = input.metaSolved ? 10 : 0;
  const total = round1(time + tokens + suspects + meta);
  return {
    total,
    breakdown: { time, tokens, suspects, meta },
    grade: gradeFor(total, input),
    parSeconds: par,
  };
}
