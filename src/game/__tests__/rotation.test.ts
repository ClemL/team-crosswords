import { describe, expect, it } from "vitest";
import { createRoomState } from "../state";
import { joinRoom, markReady, masterStart } from "../lobby";
import { mulberry32 } from "../rng";
import { finalCheck, requestRotation } from "../rotation";
import { applyDueTransitions, hasDueTransition } from "../transitions";
import { fillBoard, fillWord, makeCtx, PID, startedRoom, T0, unwrap } from "./helpers";

const ctx = makeCtx();
const rng = mulberry32(3);

describe("lobby", () => {
  it("makes the first player master and starts the timer on Ready", () => {
    let s = createRoomState({ rid: "T", puzzle: ctx.puzzle, now: T0, rng, cfg: ctx.cfg });
    const j = unwrap(joinRoom(s, ctx, PID, "  Clem   Leung  ", T0));
    expect(j.seat).toBe(0);
    s = j.state;
    expect(s.masterPid).toBe(PID);
    expect(s.players[PID]).toMatchObject({ name: "Clem Leung", initials: "CL", seat: 0 });
    expect(s.status).toBe("lobby");
    s = unwrap(markReady(s, ctx, PID, T0 + 5)).state;
    expect(s).toMatchObject({
      status: "playing",
      timerStartedAt: T0 + 5,
      tokensIssued: 2,
      tokensLeft: 2,
    });
    expect(s.cooldownUntil).toBe(T0 + 5 + ctx.cfg.cooldownMs);
  });

  it("reclaims the seat for a known player id and rejects a second player in V1", () => {
    let s = startedRoom(ctx);
    const again = unwrap(joinRoom(s, ctx, PID, "", T0 + 10));
    expect(again).toMatchObject({ seat: 0, rejoined: true });
    expect(again.state.players[PID].name).toBe("Clem Leung");
    s = again.state;
    expect(joinRoom(s, ctx, "other", "Kris", T0)).toMatchObject({ error: { code: "ROOM_FULL" } });
  });

  it("lets only the master start", () => {
    let s = createRoomState({ rid: "T", puzzle: ctx.puzzle, now: T0, rng, cfg: ctx.cfg });
    s = unwrap(joinRoom(s, ctx, PID, "Clem", T0)).state;
    expect(masterStart(s, ctx, "x", T0)).toMatchObject({ error: { code: "NOT_IN_ROOM" } });
    expect(unwrap(masterStart(s, ctx, PID, T0)).state.status).toBe("playing");
  });
});

describe("rotation", () => {
  it("is master-only and waits for the cooldown", () => {
    const s = startedRoom(ctx);
    expect(requestRotation(s, ctx, PID, "L", T0 + 1)).toMatchObject({
      error: { code: "COOLDOWN" },
    });
    const ok = unwrap(requestRotation(s, ctx, PID, "L", s.cooldownUntil));
    expect(ok.state.pendingRotation).toEqual({
      dir: "L",
      at: s.cooldownUntil + ctx.cfg.rotationWarningMs,
    });
    expect(requestRotation(ok.state, ctx, PID, "R", s.cooldownUntil + 1)).toMatchObject({
      error: { code: "COOLDOWN" },
    });
  });

  it("completes lazily: pulse, then shift, rotations++, cooldown, master", () => {
    let s = startedRoom(ctx);
    fillWord(s, ctx, 0, "B0-4A");
    const t = s.cooldownUntil;
    s = unwrap(requestRotation(s, ctx, PID, "L", t)).state;
    const at = t + ctx.cfg.rotationWarningMs;
    expect(hasDueTransition(s, at - 1, ctx.cfg)).toBe(false);
    expect(applyDueTransitions(s, ctx, at - 1, rng).changed).toBe(false);
    expect(hasDueTransition(s, at, ctx.cfg)).toBe(true);
    const { state, changed } = applyDueTransitions(s, ctx, at + 250, rng);
    expect(changed).toBe(true);
    expect(state.locked).toEqual(["B0-4A"]);
    expect(state.boardAtSeat).toEqual([1, 2, 0]);
    expect(state.rotations).toBe(1);
    expect(state.cooldownUntil).toBe(at + 250 + ctx.cfg.cooldownMs);
    expect(state.pendingRotation).toBeNull();
    expect(state.masterPid).toBe(PID);
    expect(state.masterCounts[PID]).toBe(2);
  });

  it("evaluates rotation unlocks in the pulse before the rotation counter increments", () => {
    // As written in §3.6.4 / §7.2: pulse → shift → rotations++ (see DECISIONS.md).
    let s = startedRoom(ctx);
    s.rotations = 1;
    s = unwrap(requestRotation(s, ctx, PID, "R", s.cooldownUntil)).state;
    s = applyDueTransitions(s, ctx, s.pendingRotation!.at, rng).state;
    expect(s.rotations).toBe(2);
    expect(s.unlocked).not.toContain("B1-1D"); // rotations ≥ 2: unlocks at the next pulse
  });

  it("does not hand mastership around when the single player idles", () => {
    const s = startedRoom(ctx);
    const late = s.cooldownUntil + ctx.cfg.masterIdleTimeoutMs + 1;
    s.players[PID].lastSeen = late;
    expect(hasDueTransition(s, late, ctx.cfg)).toBe(false);
    expect(applyDueTransitions(s, ctx, late, rng).changed).toBe(false);
  });
});

describe("finalCheck", () => {
  it("requires every cell filled, then pulses without rotating and starts the cooldown", () => {
    let s = startedRoom(ctx);
    const t = s.cooldownUntil;
    fillBoard(s, ctx, 0);
    fillBoard(s, ctx, 1);
    expect(finalCheck(s, ctx, PID, t)).toMatchObject({ error: { code: "NOT_FILLED" } });
    fillBoard(s, ctx, 2);
    s.boards[2].entries["0,0"] = "Z"; // one wrong letter keeps the game going
    expect(finalCheck(s, ctx, PID, t - 1)).toMatchObject({ error: { code: "COOLDOWN" } });
    s = unwrap(finalCheck(s, ctx, PID, t)).state;
    expect(s.rotations).toBe(0);
    expect(s.boardAtSeat).toEqual([0, 1, 2]);
    expect(s.finalCheckAt).toBe(t);
    expect(s.cooldownUntil).toBe(t + ctx.cfg.cooldownMs);
    expect(s.status).toBe("playing");
    expect(s.locked.length).toBe(28); // 30 words minus AWAY and ARC
  });

  it("ends the game and freezes the result when everything locks", () => {
    let s = startedRoom(ctx);
    for (const b of [0, 1, 2]) fillBoard(s, ctx, b);
    const t = T0 + 10 * 60_000;
    s.players[PID].lastSeen = t - 500;
    s = unwrap(finalCheck(s, ctx, PID, t)).state;
    expect(s.status).toBe("ended");
    expect(s.result).toMatchObject({
      grade: "S",
      total: 90,
      details: { gameSeconds: 600, effPlayers: 1 },
    });
  });
});
