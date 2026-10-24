import { describe, expect, it } from "vitest";
import { accrueActivity } from "../activity";
import { applyEntry } from "../entry";
import { joinRoom } from "../lobby";
import { guessMeta, hasGuessLeft, metaWords, normalizeGuess } from "../meta";
import { runPulse } from "../pulse";
import { mulberry32 } from "../rng";
import { toggleSuspect } from "../suspect";
import {
  fillBoard,
  fillWord,
  GAME1,
  makeCtx,
  PID,
  PID2,
  startedDuo,
  startedRoom,
  T0,
  unwrap,
} from "./helpers";

// Game 1 meta words: M1 APE, M2 CORN, M3 WATER, M4 BETTER, M5 GALLERY.
const ctx = makeCtx();
const duo = makeCtx(GAME1);
const rng = mulberry32(3);

describe("meta guesses", () => {
  it("normalizes guesses (uppercase, letters only)", () => {
    expect(normalizeGuess(" b-e-t t e r! ")).toBe("BETTER");
    expect(normalizeGuess("Better2")).toBe("BETTER");
  });

  it("checks the guess against every unobtained word and records the rotation count", () => {
    const s = startedRoom(ctx);
    s.rotations = 3;
    const r = unwrap(guessMeta(s, ctx, PID, "water!", T0, rng));
    expect(r).toMatchObject({ correct: true, metaId: "M3", points: 4.9, knockedOut: false });
    expect(r.state.metaSolved).toEqual({ M3: { at: T0, rotations: 3, by: "guess", seat: 0 } });
    expect(r.state.playerStats[PID].guesses).toEqual([
      { text: "WATER", metaId: "M3", at: T0, rotations: 3 },
    ]);
  });

  it("lets a single player keep guessing until a guess is wrong", () => {
    let s = startedRoom(ctx);
    s = unwrap(guessMeta(s, ctx, PID, "ape", T0, rng)).state;
    s = unwrap(guessMeta(s, ctx, PID, "corn", T0, rng)).state;
    expect(hasGuessLeft(s, PID, ctx.cfg)).toBe(true);
    const wrong = unwrap(guessMeta(s, ctx, PID, "wrong", T0, rng));
    expect(wrong).toMatchObject({ correct: false, metaId: null, knockedOut: false });
    s = wrong.state;
    expect(hasGuessLeft(s, PID, ctx.cfg)).toBe(false);
    expect(guessMeta(s, ctx, PID, "water", T0, rng)).toMatchObject({
      error: { code: "NO_GUESSES" },
    });
    // Alone, a wrong guess ends the guessing but not the playing.
    expect(s.knockedOut).toEqual({});
    expect(unwrap(applyEntry(s, ctx, PID, 0, 1, 1, "G", T0)).state.boards[0].entries["1,1"]).toBe(
      "G",
    );
    expect(s.playerStats[PID].guesses.map((g) => g.metaId)).toEqual(["M1", "M2", null]);
  });

  it("gives each player one guess in multiplayer; a right one is used up too", () => {
    let s = startedDuo(duo);
    const right = unwrap(guessMeta(s, duo, PID2, "corn", T0, rng));
    expect(right).toMatchObject({ correct: true, metaId: "M2", knockedOut: false });
    s = right.state;
    expect(hasGuessLeft(s, PID2, duo.cfg)).toBe(false);
    expect(guessMeta(s, duo, PID2, "ape", T0, rng)).toMatchObject({
      error: { code: "NO_GUESSES" },
    });
    expect(s.knockedOut).toEqual({});
    expect(hasGuessLeft(s, PID, duo.cfg)).toBe(true);
  });

  it("knocks a player out on a wrong multiplayer guess and passes the Capt. role on", () => {
    let s = startedDuo(duo);
    expect(s.masterPid).toBe(PID);
    const wrong = unwrap(guessMeta(s, duo, PID, "wrong", T0 + 5_000, rng));
    expect(wrong).toMatchObject({ correct: false, knockedOut: true });
    s = wrong.state;
    expect(s.knockedOut).toEqual({ [PID]: T0 + 5_000 });
    expect(s.masterPid).toBe(PID2);
    expect(s.status).toBe("playing");
    expect(hasGuessLeft(s, PID, duo.cfg)).toBe(false);
    for (const r of [
      applyEntry(s, duo, PID, 0, 1, 1, "G", T0),
      toggleSuspect(s, duo, PID, 0, 1, 1, true, T0),
      guessMeta(s, duo, PID, "corn", T0, rng),
    ]) {
      expect(r).toMatchObject({ error: { code: "KNOCKED_OUT" } });
    }
    // Active time stops at the knock-out.
    const p = { ...s.players[PID], lastSeen: T0 + 4_000 };
    expect(accrueActivity(p, s, T0 + 9_000, duo.cfg, s.knockedOut[PID]).activeSeconds).toBe(1);
  });

  it("ends the game when everyone is knocked out; unobtained words score nothing", () => {
    let s = startedDuo(duo);
    s = unwrap(guessMeta(s, duo, PID2, "ape", T0, rng)).state;
    s = unwrap(guessMeta(s, duo, PID, "wrong", T0 + 1, rng)).state;
    expect(s.status).toBe("playing");
    // PID2 already used their guess, so nobody can be knocked out any more.
    expect(guessMeta(s, duo, PID2, "x", T0, rng)).toMatchObject({ error: { code: "NO_GUESSES" } });

    let t = startedDuo(duo);
    t = unwrap(guessMeta(t, duo, PID, "wrong", T0 + 1, rng)).state;
    t = unwrap(guessMeta(t, duo, PID2, "nope", T0 + 2, rng)).state;
    expect(t.status).toBe("ended");
    expect(t.endedAt).toBe(T0 + 2);
    expect(t.result?.details.metas.every((m) => m.by === null && m.points === 0)).toBe(true);
    expect(t.result?.players.map((p) => p.knockedOut)).toEqual([true, true]);
    // Every answer is shown once the game is over.
    expect(metaWords(t, duo).map((w) => w.answer)).toEqual([
      "APE",
      "CORN",
      "WATER",
      "BETTER",
      "GALLERY",
    ]);
  });

  it("switches to multiplayer rules when a second player joins", () => {
    let s = startedRoom(duo);
    s = unwrap(guessMeta(s, duo, PID, "ape", T0, rng)).state;
    expect(hasGuessLeft(s, PID, duo.cfg)).toBe(true);
    s = unwrap(joinRoom(s, duo, PID2, "Kris", T0)).state;
    expect(hasGuessLeft(s, PID, duo.cfg)).toBe(false);
    expect(hasGuessLeft(s, PID2, duo.cfg)).toBe(true);
  });

  it("does not use the guess on an empty guess or on an already obtained word", () => {
    let s = startedRoom(ctx);
    expect(guessMeta(s, ctx, PID, "!!", T0, rng)).toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
    // APE obtained by tiles first.
    fillWord(s, ctx, 0, "B0-4A");
    fillWord(s, ctx, 1, "B1-4A");
    fillWord(s, ctx, 2, "B2-8A");
    s = runPulse(s, ctx, T0).state;
    expect(s.metaSolved.M1?.by).toBe("tiles");
    expect(guessMeta(s, ctx, PID, "ape", T0, rng)).toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
    expect(hasGuessLeft(s, PID, ctx.cfg)).toBe(true);
    expect(s.playerStats[PID].guesses).toEqual([]);
  });

  it("ends the game when a guess obtains the last word", () => {
    let s = startedRoom(ctx);
    for (const b of [0, 1, 2]) fillBoard(s, ctx, b);
    // Break GALLERY's tiles: its "Y" (board 0 r1c4) is only in GRAY and EYE.
    s.boards[0].entries["1,4"] = "Q";
    s = runPulse(s, ctx, T0 + 1).state;
    expect(s.status).toBe("playing");
    expect(Object.keys(s.metaSolved).sort()).toEqual(["M1", "M2", "M3", "M4"]);
    const r = unwrap(guessMeta(s, ctx, PID, "gallery", T0 + 2, rng));
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
    s = unwrap(guessMeta(s, ctx, PID, "ape", T0, rng)).state;
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
