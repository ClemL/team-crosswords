import { describe, expect, it } from "vitest";
import { checkCells } from "../check";
import { applyEntry } from "../entry";
import { fillWord, makeCtx, PID, startedRoom, T0, unwrap } from "./helpers";

const ctx = makeCtx();

describe("checkCells", () => {
  it("returns the wrong cells, marks them red and spends one token", () => {
    const s = startedRoom(ctx);
    fillWord(s, ctx, 0, "B0-2D", "WXLE"); // WALL: r1c3 and r3c3 wrong
    const r = unwrap(checkCells(s, ctx, PID, 0, "B0-2D", T0));
    expect(r.wrong).toEqual([
      [1, 3],
      [3, 3],
    ]);
    expect(r.locked).toBe(false);
    expect(r.state.boards[0].red.sort()).toEqual(["1,3", "3,3"]);
    expect(r.state.tokensLeft).toBe(1);
    expect(r.state.stats.tokensSpent).toBe(1);
    expect(r.state.locked).toEqual([]);
    // Editing a red cell clears its mark.
    const fixed = unwrap(applyEntry(r.state, ctx, PID, 0, 1, 3, "A", T0));
    expect(fixed.state.boards[0].red).toEqual(["3,3"]);
  });

  it("locks the word immediately when every cell is correct, without unlocking clues", () => {
    const s = startedRoom(ctx);
    fillWord(s, ctx, 0, "B0-4A"); // GRAY; r1c3 is the crossLetter source for B2-5A
    const r = unwrap(checkCells(s, ctx, PID, 0, "B0-4A", T0));
    expect(r.wrong).toEqual([]);
    expect(r.locked).toBe(true);
    expect(r.state.locked).toEqual(["B0-4A"]);
    expect(r.state.tokensLeft).toBe(1);
    expect(r.state.unlocked).not.toContain("B2-5A"); // unlocks wait for the next pulse
  });

  it("rejects empty, partial and locked words without spending a token", () => {
    const s = startedRoom(ctx);
    expect(checkCells(s, ctx, PID, 0, "B0-2D", T0)).toMatchObject({
      error: { code: "NOT_FILLED" },
    });
    s.boards[0].entries["0,3"] = "W";
    expect(checkCells(s, ctx, PID, 0, "B0-2D", T0)).toMatchObject({
      error: { code: "NOT_FILLED" },
    });
    fillWord(s, ctx, 0, "B0-4A");
    const locked = unwrap(checkCells(s, ctx, PID, 0, "B0-4A", T0)).state;
    expect(checkCells(locked, ctx, PID, 0, "B0-4A", T0)).toMatchObject({
      error: { code: "LOCKED_CELL" },
    });
    expect(locked.tokensLeft).toBe(1);
    expect(checkCells(s, ctx, PID, 0, "B1-4A", T0)).toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
    expect(s.tokensLeft).toBe(2);
  });

  it("rejects when no tokens are left", () => {
    const s = startedRoom(ctx);
    s.tokensLeft = 0;
    fillWord(s, ctx, 0, "B0-4A");
    expect(checkCells(s, ctx, PID, 0, "B0-4A", T0)).toMatchObject({ error: { code: "NO_TOKENS" } });
    expect(s.stats.tokensSpent).toBe(0);
  });
});
