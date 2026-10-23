import { describe, expect, it } from "vitest";
import { joinRoom } from "../lobby";
import { guessMeta, hasGuessLeft, metaWords, normalizeGuess } from "../meta";
import { runPulse } from "../pulse";
import { fillBoard, fillWord, GAME1, makeCtx, PID, startedRoom, T0, unwrap } from "./helpers";

// Game 1 meta words: M1 APE, M2 CORN, M3 WATER, M4 BETTER, M5 GALLERY.
const ctx = makeCtx();

describe("meta guesses", () => {
  it("normalizes guesses (uppercase, letters only)", () => {
    expect(normalizeGuess(" b-e-t t e r! ")).toBe("BETTER");
    expect(normalizeGuess("Better2")).toBe("BETTER");
  });

  it("checks the guess against every unobtained word and records the rotation count", () => {
    const s = startedRoom(ctx);
    s.rotations = 3;
    const r = unwrap(guessMeta(s, ctx, PID, "water!", T0));
    expect(r).toMatchObject({ correct: true, metaId: "M3", points: 4.9 });
    expect(r.state.metaSolved).toEqual({ M3: { at: T0, rotations: 3, by: "guess", seat: 0 } });
    expect(r.state.playerStats[PID].guess).toEqual({
      text: "WATER",
      metaId: "M3",
      at: T0,
      rotations: 3,
    });
  });

  it("gives each player one guess per game, used up whether right or wrong", () => {
    const duo = makeCtx(GAME1, { maxPlayers: 2 });
    let s = startedRoom(duo);
    s = unwrap(joinRoom(s, duo, "p-2", "Kris", T0)).state;
    s.status = "playing";

    const wrong = unwrap(guessMeta(s, duo, PID, "wrong", T0));
    expect(wrong).toMatchObject({ correct: false, metaId: null });
    s = wrong.state;
    expect(hasGuessLeft(s, PID)).toBe(false);
    expect(guessMeta(s, duo, PID, "corn", T0)).toMatchObject({ error: { code: "NO_GUESSES" } });

    // The other player still has theirs.
    const right = unwrap(guessMeta(s, duo, "p-2", "corn", T0));
    expect(right).toMatchObject({ correct: true, metaId: "M2" });
    expect(hasGuessLeft(right.state, "p-2")).toBe(false);
  });

  it("does not use the guess on an empty guess or on an already obtained word", () => {
    let s = startedRoom(ctx);
    expect(guessMeta(s, ctx, PID, "!!", T0)).toMatchObject({ error: { code: "BAD_REQUEST" } });
    // APE obtained by tiles first.
    fillWord(s, ctx, 0, "B0-4A");
    fillWord(s, ctx, 1, "B1-4A");
    fillWord(s, ctx, 2, "B2-8A");
    s = runPulse(s, ctx, T0).state;
    expect(s.metaSolved.M1?.by).toBe("tiles");
    expect(guessMeta(s, ctx, PID, "ape", T0)).toMatchObject({ error: { code: "BAD_REQUEST" } });
    expect(hasGuessLeft(s, PID)).toBe(true);
  });

  it("ends the game when a guess obtains the last word", () => {
    let s = startedRoom(ctx);
    for (const b of [0, 1, 2]) fillBoard(s, ctx, b);
    // Break GALLERY's tiles: its "Y" (board 0 r1c4) is only in GRAY and EYE.
    s.boards[0].entries["1,4"] = "Q";
    s = runPulse(s, ctx, T0 + 1).state;
    expect(s.status).toBe("playing");
    expect(Object.keys(s.metaSolved).sort()).toEqual(["M1", "M2", "M3", "M4"]);
    const r = unwrap(guessMeta(s, ctx, PID, "gallery", T0 + 2));
    expect(r.state.status).toBe("ended");
    expect(r.state.result?.details.metas.map((m) => m.by)).toEqual([
      "tiles",
      "tiles",
      "tiles",
      "tiles",
      "guess",
    ]);
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

  it("reveals an obtained word in full, with how it was obtained and its points", () => {
    let s = startedRoom(ctx);
    s.rotations = 2;
    s = unwrap(guessMeta(s, ctx, PID, "ape", T0)).state;
    expect(metaWords(s, ctx)[0]).toMatchObject({
      solved: true,
      by: "guess",
      guessedBy: "Clem Leung",
      answer: "APE",
      rotations: 2,
      points: 5.6,
      slots: [{ letter: "A" }, { letter: "P" }, { letter: "E" }],
    });
  });
});
