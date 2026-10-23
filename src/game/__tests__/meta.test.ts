import { describe, expect, it } from "vitest";
import { guessMeta, metaSlots, normalizeGuess } from "../meta";
import { runPulse } from "../pulse";
import { fillWord, makeCtx, PID, startedRoom, T0, unwrap } from "./helpers";

const ctx = makeCtx(); // meta answer BETTER

describe("meta", () => {
  it("normalizes guesses (uppercase, letters only)", () => {
    expect(normalizeGuess(" b-e-t t e r! ")).toBe("BETTER");
    expect(normalizeGuess("Better2")).toBe("BETTER");
  });

  it("accepts a correct guess after normalization", () => {
    const r = unwrap(guessMeta(startedRoom(ctx), ctx, PID, "better!", T0));
    expect(r.correct).toBe(true);
    expect(r.guessesLeft).toBe(3);
    expect(r.state.metaSolvedAt).toBe(T0);
  });

  it("allows 3 wrong guesses, then disables guessing", () => {
    let s = startedRoom(ctx);
    for (const left of [2, 1, 0]) {
      const r = unwrap(guessMeta(s, ctx, PID, "wrong", T0));
      expect(r).toMatchObject({ correct: false, guessesLeft: left });
      s = r.state;
    }
    expect(s.stats.metaWrong).toBe(3);
    expect(guessMeta(s, ctx, PID, "better", T0)).toMatchObject({ error: { code: "NO_GUESSES" } });
  });

  it("does not consume a guess for an empty guess", () => {
    const s = startedRoom(ctx);
    expect(guessMeta(s, ctx, PID, "!!", T0)).toMatchObject({ error: { code: "BAD_REQUEST" } });
    expect(s.metaGuessesLeft).toBe(3);
  });

  it("shows a slot letter once a word containing the shaded cell is locked", () => {
    let s = startedRoom(ctx);
    expect(metaSlots(s, ctx).map((x) => x.letter)).toEqual([null, null, null, null, null, null]);
    fillWord(s, ctx, 0, "B0-5A"); // TABLE contains shaded r2c2 (B)
    s = runPulse(s, ctx, T0).state;
    expect(metaSlots(s, ctx).map((x) => x.letter)).toEqual(["B", null, null, null, null, null]);
  });
});
