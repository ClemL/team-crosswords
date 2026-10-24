import { describe, expect, it } from "vitest";
import { CONFIG_V1 } from "@/config";
import {
  gradeFor,
  metaPoints,
  metaPointsExact,
  parSeconds,
  scoreGame,
  type ScoreInput,
} from "../score";

const PAR = 5 * 60;
const perfect: ScoreInput = {
  gameSeconds: PAR,
  parMinutes: 5,
  refPlayers: 1,
  effPlayers: 1,
  falseSuspects: 0,
  metaPoints: 35,
};
const clean = { falseSuspects: 0 };

describe("scoreGame components", () => {
  it("gives full time points at or under par and none at 3× par or beyond", () => {
    expect(scoreGame({ ...perfect, gameSeconds: 0 }).breakdown.time).toBe(50);
    expect(scoreGame({ ...perfect, gameSeconds: PAR }).breakdown.time).toBe(50);
    expect(scoreGame({ ...perfect, gameSeconds: 2 * PAR }).breakdown.time).toBe(25);
    expect(scoreGame({ ...perfect, gameSeconds: 3 * PAR }).breakdown.time).toBe(0);
    expect(scoreGame({ ...perfect, gameSeconds: 10 * PAR }).breakdown.time).toBe(0);
  });

  it("scores meta points and suspects; Check tokens are not an input", () => {
    const r = scoreGame({ ...perfect, metaPoints: 20.3, falseSuspects: 2 });
    expect(r.breakdown).toEqual({ time: 50, metas: 20.3, suspects: 9 });
    expect(r.total).toBe(79.3);
    expect(scoreGame({ ...perfect, falseSuspects: 9 }).breakdown.suspects).toBe(0);
  });

  it("computes par from effective players", () => {
    expect(parSeconds(5, 1, 1)).toBe(300);
    expect(parSeconds(5, 1, 4)).toBe(150);
  });

  it("gives a perfect game 100 and S*", () => {
    const r = scoreGame(perfect);
    expect(r.total).toBe(100);
    expect(r.grade).toBe("S*");
  });
});

describe("metaPoints", () => {
  it("is 7 before any rotation and loses 10% of it per rotation, floor 10%", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 30].map((r) => metaPoints(r, CONFIG_V1, 5))).toEqual([
      7, 6.3, 5.6, 4.9, 4.2, 3.5, 2.8, 2.1, 1.4, 0.7, 0.7, 0.7,
    ]);
  });

  it("splits 35 points across six words in 6x mode, adding up before rounding", () => {
    expect(metaPoints(0, CONFIG_V1, 6)).toBe(5.8);
    expect(metaPoints(3, CONFIG_V1, 6)).toBe(4.1);
    expect(6 * metaPointsExact(0, CONFIG_V1, 6)).toBeCloseTo(35, 10);
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

  it("requires 0 false suspects for S*", () => {
    expect(gradeFor(96, { falseSuspects: 1 })).toBe("S");
    expect(gradeFor(96, { falseSuspects: 0 })).toBe("S*");
  });

  it("reaches each boundary through scoreGame", () => {
    // metas 35 + suspects 15 = 50, so time decides the grade.
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
    expect(scoreGame({ ...perfect, gameSeconds: 3 * PAR, metaPoints: 0 })).toMatchObject({
      total: 15,
      grade: "F",
    });
  });
});
