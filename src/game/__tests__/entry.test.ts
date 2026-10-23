import { describe, expect, it } from "vitest";
import { createRoomState } from "../state";
import { applyEntry } from "../entry";
import { joinRoom } from "../lobby";
import { mulberry32 } from "../rng";
import { requestRotation } from "../rotation";
import { makeCtx, PID, startedRoom, T0, unwrap } from "./helpers";

const ctx = makeCtx();

describe("applyEntry", () => {
  it("writes uppercase letters and clears with an empty string", () => {
    let s = startedRoom(ctx);
    s = unwrap(applyEntry(s, ctx, PID, 0, 2, 0, "t", T0)).state;
    expect(s.boards[0].entries["2,0"]).toBe("T");
    s = unwrap(applyEntry(s, ctx, PID, 0, 2, 0, "", T0)).state;
    expect(s.boards[0].entries["2,0"]).toBeUndefined();
  });

  it("rejects black cells, bad letters, other boards and unknown players", () => {
    const s = startedRoom(ctx);
    expect(applyEntry(s, ctx, PID, 0, 0, 0, "A", T0)).toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
    expect(applyEntry(s, ctx, PID, 0, 2, 0, "AB", T0)).toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
    expect(applyEntry(s, ctx, PID, 0, 2, 0, "1", T0)).toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
    expect(applyEntry(s, ctx, PID, 1, 0, 0, "A", T0)).toMatchObject({
      error: { code: "NOT_YOUR_BOARD" },
    });
    expect(applyEntry(s, ctx, "nobody", 0, 2, 0, "A", T0)).toMatchObject({
      error: { code: "NOT_IN_ROOM" },
    });
  });

  it("is not allowed before the timer starts", () => {
    let s = createRoomState({
      rid: "T",
      puzzle: ctx.puzzle,
      now: T0,
      rng: mulberry32(1),
      cfg: ctx.cfg,
    });
    s = unwrap(joinRoom(s, ctx, PID, "Clem", T0)).state;
    expect(applyEntry(s, ctx, PID, 0, 2, 0, "A", T0)).toMatchObject({
      error: { code: "GAME_NOT_STARTED" },
    });
  });

  it("clears the red mark of an edited cell only when the letter changes", () => {
    const s = startedRoom(ctx);
    s.boards[0].entries["2,0"] = "X";
    s.boards[0].red = ["2,0", "2,1"];
    expect(unwrap(applyEntry(s, ctx, PID, 0, 2, 0, "X", T0)).state.boards[0].red).toEqual([
      "2,0",
      "2,1",
    ]);
    expect(unwrap(applyEntry(s, ctx, PID, 0, 2, 0, "T", T0)).state.boards[0].red).toEqual(["2,1"]);
  });

  it("is allowed during the rotation countdown but not once the rotation is due", () => {
    let s = startedRoom(ctx);
    const at = s.cooldownUntil;
    s = unwrap(requestRotation(s, ctx, PID, "L", at)).state;
    expect(
      unwrap(applyEntry(s, ctx, PID, 0, 2, 0, "T", at + 1)).state.boards[0].entries["2,0"],
    ).toBe("T");
    expect(applyEntry(s, ctx, PID, 0, 2, 0, "T", at + ctx.cfg.rotationWarningMs)).toMatchObject({
      error: { code: "NOT_YOUR_BOARD" },
    });
  });
});
