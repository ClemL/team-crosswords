import { describe, expect, it } from "vitest";
import { applyEntry } from "../entry";
import { runPulse } from "../pulse";
import { cellKey } from "../puzzle";
import {
  fillAll,
  fillBoard,
  fillWord,
  makeCtx,
  metaTiles,
  PID,
  startedRoom,
  T0,
  unwrap,
} from "./helpers";

const ctx = makeCtx();

describe("runPulse", () => {
  it("locks only filled words whose letters all match the solution", () => {
    const s = startedRoom(ctx);
    fillWord(s, ctx, 0, "B0-4A"); // GRAY, correct
    fillWord(s, ctx, 0, "B0-7A", "NEX"); // NET, wrong
    s.boards[0].entries[cellKey(0, 3)] = "W"; // WALL, partial (A comes from GRAY)
    const { state, newlyLocked } = runPulse(s, ctx, T0 + 1);
    expect(newlyLocked).toEqual(["B0-4A"]);
    expect(state.locked).toEqual(["B0-4A"]);
    // The input state is not mutated.
    expect(s.locked).toEqual([]);
  });

  it("gives no feedback for wrong filled words", () => {
    const s = startedRoom(ctx);
    fillWord(s, ctx, 0, "B0-7A", "NEX");
    const { state } = runPulse(s, ctx, T0 + 1);
    expect(state.locked).toEqual([]);
  });

  it("evaluates unlocks on the post-lock state so locks cascade into unlocks in the same pulse", () => {
    const s = startedRoom(ctx);
    fillBoard(s, ctx, 0); // 10 correct words on board 0
    expect(s.unlocked).not.toContain("B0-3D"); // solvedCount ≥ 8
    expect(s.unlocked).not.toContain("B2-2D"); // solvedCount ≥ 8
    const { state, newlyUnlocked } = runPulse(s, ctx, T0 + 1);
    expect(state.locked).toHaveLength(10);
    expect(newlyUnlocked).toEqual(expect.arrayContaining(["B0-3D", "B2-2D"]));
    expect(state.unlocked).not.toContain("B0-5A"); // needs 12
  });

  it("uses the letter in the crossLetter source cell at pulse time", () => {
    // B2-5A unlocks when board 0 r1c3 (0-based) holds the correct letter "A".
    let s = startedRoom(ctx);
    s.boards[0].entries[cellKey(1, 3)] = "X";
    s = runPulse(s, ctx, T0 + 1).state;
    expect(s.unlocked).not.toContain("B2-5A");
    s.boards[0].entries[cellKey(1, 3)] = "A";
    expect(s.unlocked).not.toContain("B2-5A"); // nothing changes between pulses
    s = runPulse(s, ctx, T0 + 2).state;
    expect(s.unlocked).toContain("B2-5A");
  });

  it("keeps unlocks after the source letter is later changed", () => {
    let s = startedRoom(ctx);
    s.boards[0].entries[cellKey(1, 3)] = "A";
    s = runPulse(s, ctx, T0 + 1).state;
    expect(s.unlocked).toContain("B2-5A");
    s.boards[0].entries[cellKey(1, 3)] = "Q";
    s = runPulse(s, ctx, T0 + 2).state;
    expect(s.unlocked).toContain("B2-5A");
  });

  it("unlocks rotation clues from the room's rotation count", () => {
    let s = startedRoom(ctx);
    s.rotations = 1;
    s = runPulse(s, ctx, T0 + 1).state;
    expect(s.unlocked).not.toContain("B1-1D"); // rotations ≥ 2
    s.rotations = 2;
    s = runPulse(s, ctx, T0 + 2).state;
    expect(s.unlocked).toContain("B1-1D");
  });

  it("clears suspect marks on cells that lock", () => {
    const s = startedRoom(ctx);
    fillWord(s, ctx, 0, "B0-4A");
    s.boards[0].suspects[cellKey(1, 2)] = PID;
    const { state } = runPulse(s, ctx, T0 + 1);
    expect(state.boards[0].suspects).toEqual({});
  });

  it("obtains a meta word when all of its tiles lock, at the rotation count before the pulse", () => {
    const s = startedRoom(ctx);
    s.rotations = 2;
    // APE: one cell on each of three boards; lock the across words through the first two.
    const [first, second, last] = metaTiles(ctx, "M1");
    for (const [b, id] of [first, second]) fillWord(s, ctx, b, id);
    const half = runPulse(s, ctx, T0 + 1).state;
    expect(half.metaSolved.M1).toBeUndefined();
    fillWord(half, ctx, last[0], last[1]);
    const { state } = runPulse(half, ctx, T0 + 2);
    expect(state.metaSolved.M1).toEqual({ at: T0 + 2, rotations: 2, by: "tiles" });
    expect(state.status).toBe("playing");
  });

  it("ends the game once every meta word is obtained, even with clues unsolved", () => {
    const s = startedRoom(ctx);
    fillAll(s, ctx);
    // Blank one cell that is not a meta cell: its two words stay unsolved, but every meta cell
    // still locks through its other word.
    const metaCells = new Set(
      ctx.puzzle.metas.flatMap((m) => m.cells.map(([b, r, c]) => `${b}:${r},${c}`)),
    );
    const spare = Object.keys(s.boards[1].entries).find((k) => !metaCells.has(`1:${k}`))!;
    delete s.boards[1].entries[spare];
    const { state, ended } = runPulse(s, ctx, T0 + 60_000);
    expect(state.locked.length).toBeLessThan(ctx.puzzle.boards.flatMap((b) => b.clues).length);
    expect(ended).toBe(true);
    expect(state.status).toBe("ended");
  });

  it("ends the game when every word is locked", () => {
    const s = startedRoom(ctx);
    fillAll(s, ctx);
    const { state, ended } = runPulse(s, ctx, T0 + 600_000);
    expect(ended).toBe(true);
    expect(state.status).toBe("ended");
    expect(state.endedAt).toBe(T0 + 600_000);
    expect(state.result?.grade).toBeDefined();
  });
});

describe("locked cells", () => {
  it("reject edits, including through an unlocked crossing word", () => {
    let s = startedRoom(ctx);
    fillWord(s, ctx, 0, "B0-4A"); // GRAY at row 1, cols 1–4
    s = runPulse(s, ctx, T0 + 1).state;
    // r1c2 also belongs to B0-1D (ORBIT), which is not locked.
    const r = applyEntry(s, ctx, PID, 0, 1, 2, "Z", T0 + 2);
    expect(r).toMatchObject({ ok: false, error: { code: "LOCKED_CELL" } });
    const clear = applyEntry(s, ctx, PID, 0, 1, 2, "", T0 + 2);
    expect(clear).toMatchObject({ ok: false, error: { code: "LOCKED_CELL" } });
    // An unlocked cell of the crossing word is still editable.
    expect(
      unwrap(applyEntry(s, ctx, PID, 0, 0, 2, "o", T0 + 2)).state.boards[0].entries["0,2"],
    ).toBe("O");
  });
});
