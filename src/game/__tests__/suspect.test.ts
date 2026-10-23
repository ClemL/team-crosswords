import { describe, expect, it } from "vitest";
import { runPulse } from "../pulse";
import { toggleSuspect } from "../suspect";
import { fillWord, makeCtx, PID, startedRoom, T0, unwrap } from "./helpers";

const ctx = makeCtx();

describe("toggleSuspect", () => {
  it("counts a false suspect only when the cell held the correct letter at marking time", () => {
    let s = startedRoom(ctx);
    s.boards[0].entries["2,0"] = "T"; // correct
    s.boards[0].entries["2,1"] = "X"; // wrong (A)
    s = unwrap(toggleSuspect(s, ctx, PID, 0, 2, 0, true, T0)).state;
    expect(s.stats.falseSuspects).toBe(1);
    s = unwrap(toggleSuspect(s, ctx, PID, 0, 2, 1, true, T0)).state;
    expect(s.stats.falseSuspects).toBe(1);
    expect(s.stats.accurateSuspects).toBe(1);
    s = unwrap(toggleSuspect(s, ctx, PID, 0, 2, 2, true, T0)).state; // empty cell: never false
    expect(s.stats.falseSuspects).toBe(1);
    expect(s.stats.accurateSuspects).toBe(1);
    // Later edits do not change the count.
    s.boards[0].entries["2,1"] = "A";
    s.boards[0].entries["2,2"] = "B";
    expect(s.stats.falseSuspects).toBe(1);
    expect(s.boards[0].suspects).toEqual({ "2,0": PID, "2,1": PID, "2,2": PID });
  });

  it("toggles off without changing stats and ignores repeated marks", () => {
    let s = startedRoom(ctx);
    s.boards[0].entries["2,0"] = "T";
    s = unwrap(toggleSuspect(s, ctx, PID, 0, 2, 0, true, T0)).state;
    s = unwrap(toggleSuspect(s, ctx, PID, 0, 2, 0, true, T0)).state;
    expect(s.stats.falseSuspects).toBe(1);
    s = unwrap(toggleSuspect(s, ctx, PID, 0, 2, 0, false, T0)).state;
    expect(s.boards[0].suspects).toEqual({});
    expect(s.stats.falseSuspects).toBe(1);
  });

  it("rejects locked and black cells", () => {
    let s = startedRoom(ctx);
    fillWord(s, ctx, 0, "B0-4A");
    s = runPulse(s, ctx, T0).state;
    expect(toggleSuspect(s, ctx, PID, 0, 1, 1, true, T0)).toMatchObject({
      error: { code: "LOCKED_CELL" },
    });
    expect(toggleSuspect(s, ctx, PID, 0, 0, 0, true, T0)).toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
  });
});
