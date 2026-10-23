import { describe, expect, it } from "vitest";
import { gradeFor, parSeconds, scoreGame, type ScoreInput } from "../score";

const PAR = 15 * 60;
const perfect: ScoreInput = {
  gameSeconds: PAR,
  parMinutes: 15,
  refPlayers: 1,
  effPlayers: 1,
  tokensSpent: 0,
  tokensIssued: 2,
  falseSuspects: 0,
  metaSolved: true,
};
const clean = { tokensSpent: 0, falseSuspects: 0, metaSolved: true };

describe("scoreGame components", () => {
  it("gives full time points at or under par and none at 3× par or beyond", () => {
    expect(scoreGame({ ...perfect, gameSeconds: 0 }).breakdown.time).toBe(50);
    expect(scoreGame({ ...perfect, gameSeconds: PAR }).breakdown.time).toBe(50);
    expect(scoreGame({ ...perfect, gameSeconds: 2 * PAR }).breakdown.time).toBe(25);
    expect(scoreGame({ ...perfect, gameSeconds: 3 * PAR }).breakdown.time).toBe(0);
    expect(scoreGame({ ...perfect, gameSeconds: 10 * PAR }).breakdown.time).toBe(0);
  });

  it("scores tokens, suspects and meta", () => {
    const r = scoreGame({ ...perfect, tokensSpent: 1, falseSuspects: 2, metaSolved: false });
    expect(r.breakdown).toEqual({ time: 50, tokens: 12.5, suspects: 9, meta: 0 });
    expect(r.total).toBe(71.5);
    expect(scoreGame({ ...perfect, falseSuspects: 9 }).breakdown.suspects).toBe(0);
  });

  it("computes par from effective players", () => {
    expect(parSeconds(15, 1, 1)).toBe(900);
    expect(parSeconds(15, 1, 4)).toBe(450);
  });

  it("gives a perfect game 100 and S*", () => {
    const r = scoreGame(perfect);
    expect(r.total).toBe(100);
    expect(r.grade).toBe("S*");
  });
});

describe("grade boundaries", () => {
  it.each([
    [95, "S*"],
    [94.9, "S"],
    [90, "S"],
    [89.9, "A"],
    [80, "A"],
    [79.9, "B"],
    [70, "B"],
    [69.9, "C"],
    [60, "C"],
    [59.9, "D"],
    [50, "D"],
    [49.9, "F"],
    [0, "F"],
  ] as const)("total %s → %s", (total, grade) => {
    expect(gradeFor(total, clean)).toBe(grade);
  });

  it("requires 0 tokens, 0 false suspects and a solved meta for S*", () => {
    expect(gradeFor(96, { ...clean, tokensSpent: 1 })).toBe("S");
    expect(gradeFor(96, { ...clean, falseSuspects: 1 })).toBe("S");
    expect(gradeFor(96, { ...clean, metaSolved: false })).toBe("S");
  });

  it("reaches each boundary through scoreGame", () => {
    // tokens 25 + suspects 15 + meta 10 = 50, so time decides the grade.
    const at = (time: number) => {
      const ratio = 3 - (2 * time) / 50;
      return scoreGame({ ...perfect, gameSeconds: ratio * PAR });
    };
    expect(at(45)).toMatchObject({ total: 95, grade: "S*" });
    expect(at(40)).toMatchObject({ total: 90, grade: "S" });
    expect(at(30)).toMatchObject({ total: 80, grade: "A" });
    expect(at(20)).toMatchObject({ total: 70, grade: "B" });
    expect(at(10)).toMatchObject({ total: 60, grade: "C" });
    expect(at(0)).toMatchObject({ total: 50, grade: "D" });
    expect(scoreGame({ ...perfect, gameSeconds: 3 * PAR, metaSolved: false })).toMatchObject({
      total: 40,
      grade: "F",
    });
  });
});
