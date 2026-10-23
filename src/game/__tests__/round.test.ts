import { describe, expect, it } from "vitest";
import type { GameCtx } from "../context";
import { applyEntry } from "../entry";
import { joinRoom, restartRoom, seatForNewPlayer } from "../lobby";
import { guessMeta } from "../meta";
import { runPulse } from "../pulse";
import { mulberry32 } from "../rng";
import { completeRotation, requestRotation } from "../rotation";
import { createRoomState } from "../state";
import type { RoomState } from "../types";
import { buildBoardView } from "../views";
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

const ctx = makeCtx(GAME1);
const rng = mulberry32(5);

/** The Capt. rotates left and the countdown runs out. */
function rotateLeft(s: RoomState, c: GameCtx = ctx): RoomState {
  const at = Math.max(s.cooldownUntil, T0);
  const r = unwrap(requestRotation(s, c, s.masterPid!, "L", at, rng)).state;
  return completeRotation(r, c, at + c.cfg.rotationWarningMs, rng);
}

describe("seating", () => {
  it("seats at most one player per board", () => {
    let s = startedRoom(ctx);
    s = unwrap(joinRoom(s, ctx, PID2, "Kris", T0)).state;
    s = unwrap(joinRoom(s, ctx, "p-3", "Srini", T0)).state;
    expect(seatForNewPlayer(s, ctx)).toBeNull();
  });

  it("spreads players around a larger ring, leaving empty seats between them", () => {
    // A six-board ring (the boards are repeated; seating only looks at the count).
    const six: GameCtx = {
      ...ctx,
      puzzle: { ...ctx.puzzle, boards: [...ctx.puzzle.boards, ...ctx.puzzle.boards] },
    };
    let s = createRoomState({ rid: "SIX", puzzle: six.puzzle, now: T0, rng, cfg: six.cfg });
    const seats: number[] = [];
    for (const [i, name] of ["Clem", "Lori", "Kris"].entries()) {
      const j = unwrap(joinRoom(s, six, `p-${i}`, name, T0));
      seats.push(j.seat);
      s = j.state;
    }
    expect(seats).toEqual([0, 3, 1]);
  });
});

describe("wrong letters passed on", () => {
  it("counts, at each rotation, the wrong letters a player typed on the board leaving them", () => {
    let s = startedDuo(ctx); // Clem holds board 0, Kris board 1
    s = unwrap(applyEntry(s, ctx, PID, 0, 2, 0, "X", T0)).state; // TABLE's T
    s = unwrap(applyEntry(s, ctx, PID, 0, 2, 1, "A", T0)).state; // right
    s = unwrap(applyEntry(s, ctx, PID2, 1, 0, 0, "Q", T0)).state;
    s = unwrap(applyEntry(s, ctx, PID2, 1, 0, 1, "Q", T0)).state;
    s = rotateLeft(s);
    expect(s.playerStats[PID].wrongLeft).toBe(1);
    expect(s.playerStats[PID2].wrongLeft).toBe(2);
    // Next rotation: Clem holds board 1, whose wrong letters are Kris's, so nobody adds any.
    s = rotateLeft(s);
    expect([s.playerStats[PID].wrongLeft, s.playerStats[PID2].wrongLeft]).toEqual([1, 2]);
  });

  it("shows on the scorecards and as a team total", () => {
    let s = startedRoom(ctx);
    for (const b of [0, 1, 2]) fillBoard(s, ctx, b);
    for (const b of [0, 1, 2]) {
      for (const k of Object.keys(s.boards[b].entries)) s.boards[b].authors[k] = PID;
    }
    // GALLERY's Y (board 0, r1c4) is wrong, so the first rotation cannot end the game.
    s.boards[0].entries["1,4"] = "Q";
    s = rotateLeft(s);
    expect(s.status).toBe("playing");
    expect(s.boardAtSeat[0]).toBe(0); // boards 1 and 2 are done; board 0 comes back
    s.boards[0].entries["1,4"] = "Y";
    s = rotateLeft(s);
    expect(s.status).toBe("ended");
    expect(s.result!.players[0].wrongLeft).toBe(1);
    expect(s.result!.details.wrongLeft).toBe(1);
  });
});

describe("restart", () => {
  it("lets only the Capt. restart a game in progress, and keeps players and seats", () => {
    let s = startedDuo(ctx);
    fillWord(s, ctx, 0, "B0-4A");
    s = unwrap(guessMeta(s, ctx, PID2, "corn", T0, rng)).state;
    s = rotateLeft(s);
    expect(restartRoom(s, ctx, s.masterPid === PID ? PID2 : PID, T0)).toMatchObject({
      error: { code: "NOT_MASTER" },
    });
    const capt = s.masterPid!;
    const r = unwrap(restartRoom(s, ctx, capt, T0 + 1)).state;
    expect(r).toMatchObject({
      status: "lobby",
      rotations: 0,
      metaSolved: {},
      locked: [],
      result: null,
      timerStartedAt: null,
      knockedOut: {},
      ready: [],
      masterPid: capt,
      seats: s.seats,
      boardAtSeat: [0, 1, 2],
      boardEmojis: s.boardEmojis,
      version: s.version,
    });
    expect(r.boards.every((b) => Object.keys(b.entries).length === 0)).toBe(true);
    expect(Object.keys(r.players).sort()).toEqual([PID, PID2]);
    expect(r.playerStats[PID2].guesses).toEqual([]);
  });

  it("lets anyone restart once the game is over", () => {
    let s = startedDuo(ctx);
    s = unwrap(guessMeta(s, ctx, PID, "nope", T0, rng)).state;
    s = unwrap(guessMeta(s, ctx, PID2, "nope", T0, rng)).state;
    expect(s.status).toBe("ended");
    const notCapt = s.masterPid === PID ? PID2 : PID;
    expect(unwrap(restartRoom(s, ctx, notCapt, T0)).state.status).toBe("lobby");
  });
});

describe("unlock helper cells", () => {
  it("marks the cells whose letter unlocks a hidden clue on another board, until it unlocks", () => {
    let s = startedRoom(ctx);
    const [e0, e1] = [s.boardEmojis[0].e, s.boardEmojis[1].e];
    // Game 1, board 2 holds the letters that 1A, 5D (board 0) and 8A, 5D (board 1) wait on.
    expect(buildBoardView(s, ctx, 2).helperCells).toEqual([
      { r: 0, c: 0, boards: [e0] },
      { r: 0, c: 3, boards: [e1] },
      { r: 2, c: 0, boards: [e1] },
      { r: 4, c: 2, boards: [e0] },
    ]);
    s.boards[2].entries["0,0"] = "A";
    s = runPulse(s, ctx, T0).state; // board 0's 1A unlocks
    expect(buildBoardView(s, ctx, 2).helperCells.map((h) => [h.r, h.c])).toEqual([
      [0, 3],
      [2, 0],
      [4, 2],
    ]);
  });
});
