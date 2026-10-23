import { describe, expect, it } from "vitest";
import { guessMeta, metaWords, normalizeGuess } from "../meta";
import { runPulse } from "../pulse";
import { fillBoard, fillWord, makeCtx, PID, startedRoom, T0, unwrap } from "./helpers";

// Game 1 meta words: M1 APE, M2 CORN, M3 WATER, M4 BETTER, M5 GALLERY.
const ctx = makeCtx();

describe("meta guesses", () => {
  it("normalizes guesses (uppercase, letters only)", () => {
    expect(normalizeGuess(" b-e-t t e r! ")).toBe("BETTER");
    expect(normalizeGuess("Better2")).toBe("BETTER");
  });

  it("checks one guess against every unsolved word and records the rotation count", () => {
    const s = startedRoom(ctx);
    s.rotations = 3;
    const r = unwrap(guessMeta(s, ctx, PID, "water!", T0));
    expect(r).toMatchObject({ correct: true, metaId: "M3", points: 4.9, guessesLeft: 3 });
    expect(r.state.metaSolved).toEqual({ M3: { at: T0, rotations: 3 } });
  });

  it("loses 10% of a word's 7 points per rotation, down to 10%", () => {
    for (const [rotations, points] of [
      [0, 7],
      [1, 6.3],
      [5, 3.5],
      [9, 0.7],
      [20, 0.7],
    ] as const) {
      const s = startedRoom(ctx);
      s.rotations = rotations;
      expect(unwrap(guessMeta(s, ctx, PID, "gallery", T0)).points).toBe(points);
    }
  });

  it("shares 3 wrong guesses across all words; correct guesses cost nothing", () => {
    let s = startedRoom(ctx);
    s = unwrap(guessMeta(s, ctx, PID, "corn", T0)).state;
    for (const left of [2, 1, 0]) {
      const r = unwrap(guessMeta(s, ctx, PID, "wrong", T0));
      expect(r).toMatchObject({ correct: false, guessesLeft: left, metaId: null });
      s = r.state;
    }
    expect(s.stats.metaWrong).toBe(3);
    expect(guessMeta(s, ctx, PID, "better", T0)).toMatchObject({ error: { code: "NO_GUESSES" } });
    // Re-guessing a solved word is free, even with no guesses left.
    expect(unwrap(guessMeta(s, ctx, PID, "corn", T0))).toMatchObject({
      correct: true,
      metaId: "M2",
    });
  });

  it("does not consume a guess for an empty guess", () => {
    const s = startedRoom(ctx);
    expect(guessMeta(s, ctx, PID, "!!", T0)).toMatchObject({ error: { code: "BAD_REQUEST" } });
    expect(s.metaGuessesLeft).toBe(3);
  });
});

describe("meta words view", () => {
  it("shows a slot letter once a word containing the cell is locked, and no answer", () => {
    let s = startedRoom(ctx);
    expect(metaWords(s, ctx)[3].slots.map((x) => x.letter)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    fillWord(s, ctx, 0, "B0-5A"); // TABLE contains BETTER's first cell (board 0, r2c2 = B)
    s = runPulse(s, ctx, T0).state;
    const better = metaWords(s, ctx)[3];
    expect(better.slots.map((x) => x.letter)).toEqual(["B", null, null, null, null, null]);
    expect(better.answer).toBeUndefined();
  });

  it("reveals a solved word in full with its points", () => {
    let s = startedRoom(ctx);
    s.rotations = 2;
    s = unwrap(guessMeta(s, ctx, PID, "ape", T0)).state;
    expect(metaWords(s, ctx)[0]).toMatchObject({
      solved: true,
      answer: "APE",
      rotations: 2,
      points: 5.6,
      slots: [{ letter: "A" }, { letter: "P" }, { letter: "E" }],
    });
  });

  it("auto-completes unguessed words at the end, for 0 points", () => {
    let s = startedRoom(ctx);
    s = unwrap(guessMeta(s, ctx, PID, "better", T0)).state; // 0 rotations: 7 points
    for (const b of [0, 1, 2]) fillBoard(s, ctx, b);
    s = runPulse(s, ctx, T0 + 60_000).state;
    expect(s.status).toBe("ended");
    const words = metaWords(s, ctx);
    expect(words.map((w) => w.answer)).toEqual(["APE", "CORN", "WATER", "BETTER", "GALLERY"]);
    expect(words.filter((w) => w.autoCompleted).length).toBe(4);
    expect(s.result?.breakdown.metas).toBe(7);
    expect(s.result?.details.metas.map((m) => m.points)).toEqual([0, 0, 0, 7, 0]);
    expect(guessMeta(s, ctx, PID, "ape", T0)).toMatchObject({ error: { code: "GAME_ENDED" } });
  });
});
