import { describe, expect, it } from "vitest";
import { createRoomState, cooldownFor } from "../state";
import { joinRoom, markReady, masterStart } from "../lobby";
import { mulberry32 } from "../rng";
import { finalCheck, requestRotation } from "../rotation";
import { applyDueTransitions, hasDueTransition } from "../transitions";
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

const ctx = makeCtx();
const duoCtx = makeCtx(GAME1);
const rng = mulberry32(3);

describe("lobby", () => {
  it("makes the first player Capt. and starts the timer on Ready, with no cooldown alone", () => {
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
    });
    expect(s.cooldownUntil).toBe(T0 + 5);
  });

  it("starts a multiplayer game with one full cooldown", () => {
    const s = startedDuo(duoCtx);
    expect(s.cooldownUntil).toBe(T0 + duoCtx.cfg.cooldownMs);
  });

  it("reclaims the seat for a known player id, seats up to 3 players, then is full", () => {
    let s = startedRoom(ctx);
    const again = unwrap(joinRoom(s, ctx, PID, "", T0 + 10));
    expect(again).toMatchObject({ seat: 0, rejoined: true });
    expect(again.state.players[PID].name).toBe("Clem Leung");
    s = again.state;
    const second = unwrap(joinRoom(s, ctx, "p-2", "Kris", T0));
    expect(second.seat).toBe(1);
    const third = unwrap(joinRoom(second.state, ctx, "p-3", "Srini", T0));
    expect(third.seat).toBe(2);
    expect(joinRoom(third.state, ctx, "p-4", "Teja", T0)).toMatchObject({
      error: { code: "ROOM_FULL" },
    });
  });

  it("lets only the Capt. start", () => {
    let s = createRoomState({ rid: "T", puzzle: ctx.puzzle, now: T0, rng, cfg: ctx.cfg });
    s = unwrap(joinRoom(s, ctx, PID, "Clem", T0)).state;
    expect(masterStart(s, ctx, "x", T0)).toMatchObject({ error: { code: "NOT_IN_ROOM" } });
    expect(unwrap(masterStart(s, ctx, PID, T0)).state.status).toBe("playing");
  });
});

describe("single-player rotation", () => {
  it("validates and swaps at once, with no cooldown and no countdown", () => {
    let s = startedRoom(ctx);
    fillWord(s, ctx, 0, "B0-4A");
    s = unwrap(requestRotation(s, ctx, PID, "L", T0 + 1, rng)).state;
    expect(s.pendingRotation).toBeNull();
    expect(s.locked).toEqual(["B0-4A"]);
    expect(s.boardAtSeat).toEqual([1, 2, 0]);
    expect(s.rotations).toBe(1);
    expect(s.cooldownUntil).toBe(T0 + 1);
    // And again immediately.
    s = unwrap(requestRotation(s, ctx, PID, "R", T0 + 1, rng)).state;
    expect(s.boardAtSeat).toEqual([0, 1, 2]);
    expect(s.rotations).toBe(2);
  });

  it("evaluates rotation unlocks in the pulse before the rotation counter increments", () => {
    // As written in §3.6.4 / §7.2: pulse → shift → rotations++ (see DECISIONS.md).
    let s = startedRoom(ctx);
    s.rotations = 1;
    s = unwrap(requestRotation(s, ctx, PID, "R", T0, rng)).state;
    expect(s.rotations).toBe(2);
    expect(s.unlocked).not.toContain("B1-1D"); // rotations ≥ 2: unlocks at the next pulse
  });

  it("does not hand the Capt. role around when the single player idles", () => {
    const s = startedRoom(ctx);
    const late = s.cooldownUntil + ctx.cfg.masterIdleTimeoutMs + 1;
    s.players[PID].lastSeen = late;
    expect(hasDueTransition(s, late, ctx.cfg)).toBe(false);
    expect(applyDueTransitions(s, ctx, late, rng).changed).toBe(false);
  });
});

describe("multiplayer rotation", () => {
  it("is Capt.-only, waits for the cooldown, then warns before rotating", () => {
    const s = startedDuo(duoCtx);
    const capt = s.masterPid!;
    const other = capt === PID ? PID2 : PID;
    expect(requestRotation(s, duoCtx, other, "L", s.cooldownUntil, rng)).toMatchObject({
      error: { code: "NOT_MASTER", message: "Only the Capt. can do that." },
    });
    expect(requestRotation(s, duoCtx, capt, "L", T0 + 1, rng)).toMatchObject({
      error: { code: "COOLDOWN" },
    });
    const ok = unwrap(requestRotation(s, duoCtx, capt, "L", s.cooldownUntil, rng));
    expect(ok.state.pendingRotation).toEqual({
      dir: "L",
      at: s.cooldownUntil + duoCtx.cfg.rotationWarningMs,
    });
    expect(requestRotation(ok.state, duoCtx, capt, "R", s.cooldownUntil + 1, rng)).toMatchObject({
      error: { code: "COOLDOWN" },
    });
  });

  it("completes lazily: pulse, then shift, rotations++, a 1 s shorter cooldown, next Capt.", () => {
    let s = startedDuo(duoCtx);
    const capt = s.masterPid!;
    fillWord(s, duoCtx, 0, "B0-4A");
    const t = s.cooldownUntil;
    s = unwrap(requestRotation(s, duoCtx, capt, "L", t, rng)).state;
    const at = t + duoCtx.cfg.rotationWarningMs;
    for (const p of Object.values(s.players)) p.lastSeen = at;
    expect(hasDueTransition(s, at - 1, duoCtx.cfg)).toBe(false);
    expect(applyDueTransitions(s, duoCtx, at - 1, rng).changed).toBe(false);
    expect(hasDueTransition(s, at, duoCtx.cfg)).toBe(true);
    const { state, changed } = applyDueTransitions(s, duoCtx, at + 250, rng);
    expect(changed).toBe(true);
    expect(state.locked).toEqual(["B0-4A"]);
    expect(state.boardAtSeat).toEqual([1, 2, 0]);
    expect(state.rotations).toBe(1);
    expect(state.cooldownUntil).toBe(at + 250 + 19_000);
    expect(state.pendingRotation).toBeNull();
    expect(state.masterPid).not.toBe(capt);
  });

  it("shortens the cooldown by 1 s per rotation, never below the minimum", () => {
    const players = { a: {}, b: {} } as never;
    const cfg = duoCtx.cfg;
    expect(cooldownFor({ players, rotations: 0 }, cfg)).toBe(20_000);
    expect(cooldownFor({ players, rotations: 1 }, cfg)).toBe(19_000);
    expect(cooldownFor({ players, rotations: 5 }, cfg)).toBe(15_000);
    expect(cooldownFor({ players, rotations: 25 }, cfg)).toBe(0);
    expect(cooldownFor({ players: { a: {} } as never, rotations: 0 }, cfg)).toBe(0);
  });
});

describe("finalCheck", () => {
  it("requires every cell filled, then pulses without rotating", () => {
    let s = startedRoom(ctx);
    const t = T0 + 1;
    fillBoard(s, ctx, 0);
    fillBoard(s, ctx, 1);
    expect(finalCheck(s, ctx, PID, t)).toMatchObject({ error: { code: "NOT_FILLED" } });
    fillBoard(s, ctx, 2);
    s.boards[2].entries["0,0"] = "Z"; // one wrong letter keeps the game going
    s = unwrap(finalCheck(s, ctx, PID, t)).state;
    expect(s.rotations).toBe(0);
    expect(s.boardAtSeat).toEqual([0, 1, 2]);
    expect(s.finalCheckAt).toBe(t);
    expect(s.cooldownUntil).toBe(t); // no cooldown alone
    expect(s.status).toBe("playing");
    expect(s.locked.length).toBe(28); // 30 words minus AWAY and ARC
  });

  it("respects the cooldown in multiplayer", () => {
    const s = startedDuo(duoCtx);
    for (const b of [0, 1, 2]) fillBoard(s, duoCtx, b);
    expect(finalCheck(s, duoCtx, s.masterPid!, s.cooldownUntil - 1)).toMatchObject({
      error: { code: "COOLDOWN" },
    });
  });

  it("ends the game and freezes the result when everything locks", () => {
    let s = startedRoom(ctx);
    for (const b of [0, 1, 2]) fillBoard(s, ctx, b);
    const t = T0 + 4 * 60_000;
    s.players[PID].lastSeen = t - 500;
    s = unwrap(finalCheck(s, ctx, PID, t)).state;
    expect(s.status).toBe("ended");
    // Under par: 50 time + 35 metas (all 5 obtained by tiles before any rotation) + 15 suspects.
    expect(s.result).toMatchObject({
      grade: "S*",
      total: 100,
      details: { gameSeconds: 240, effPlayers: 1 },
    });
  });
});

describe("completed boards leave the ring", () => {
  it("drops a board whose words all lock in the rotation, and hands over the next one", () => {
    let s = startedRoom(ctx);
    fillBoard(s, ctx, 0);
    s = unwrap(requestRotation(s, ctx, PID, "L", T0, rng)).state;
    // Board 0 locked completely: it leaves instead of moving to seat 2; Left brings board 1.
    expect(s.boardAtSeat).toEqual([1, 2, null]);
    // Alone, a Left rotation would now bring the gap, so the next board along is taken instead.
    s = unwrap(requestRotation(s, ctx, PID, "L", T0 + 1, rng)).state;
    expect(s.boardAtSeat).toEqual([2, null, 1]);
  });

  it("keeps a board completed by Final Check until the next rotation", () => {
    let s = startedRoom(ctx);
    for (const b of [0, 1, 2]) fillBoard(s, ctx, b);
    s.boards[2].entries["0,0"] = "Q"; // AWAY / ARC stay unlocked, so the game goes on
    s = unwrap(finalCheck(s, ctx, PID, T0)).state;
    expect(s.status).toBe("playing");
    expect(s.boardAtSeat).toEqual([0, 1, 2]);
    s = unwrap(requestRotation(s, ctx, PID, "R", T0 + 1, rng)).state;
    expect(s.boardAtSeat).toEqual([2, null, null]);
  });
});
