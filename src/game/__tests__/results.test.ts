import { describe, expect, it } from "vitest";
import { applyEntry } from "../entry";
import { guessMeta } from "../meta";
import { runPulse } from "../pulse";
import { mulberry32 } from "../rng";
import { requestRotation } from "../rotation";
import { toggleSuspect } from "../suspect";
import { applyDueTransitions } from "../transitions";
import { buildHostView } from "../views";
import type { GameCtx } from "../context";
import type { RoomState } from "../types";
import {
  boardIndexes,
  fillAll,
  GAME1,
  makeCtx,
  openCells,
  PID,
  PID2,
  startedDuo,
  T0,
  unwrap,
} from "./helpers";

const ctx = makeCtx(GAME1);
const rng = mulberry32(11);

/** Types the solution of `board` as `pid` through the real rule function. */
function typeBoard(s: RoomState, c: GameCtx, pid: string, board: number, now: number): RoomState {
  c.solution.boards[board].forEach((row, r) =>
    [...row].forEach((ch, col) => {
      if (ch !== "#") s = unwrap(applyEntry(s, c, pid, board, r, col, ch, now)).state;
    }),
  );
  return s;
}

/** Lets the current Capt. rotate left and completes the rotation. */
function rotateLeft(s: RoomState, now: number): RoomState {
  const t = Math.max(now, s.cooldownUntil);
  s = unwrap(requestRotation(s, ctx, s.masterPid!, "L", t, rng)).state;
  const at = s.pendingRotation!.at;
  for (const p of Object.values(s.players)) p.lastSeen = at;
  return applyDueTransitions(s, ctx, at, rng).state;
}

describe("scorecards, board MVPs and the tiles leaderboard", () => {
  it("credits each locked tile to whoever typed it", () => {
    let s = startedDuo(ctx); // Clem in seat 0 (board 0), Kris across the ring in seat 2 (board 2)
    expect([s.players[PID].seat, s.players[PID2].seat]).toEqual([0, 2]);
    s = typeBoard(s, ctx, PID, 0, T0);
    s = typeBoard(s, ctx, PID2, 2, T0);
    // Clem overwrites one of his letters with a wrong one, then fixes it: still his tile.
    s = unwrap(applyEntry(s, ctx, PID, 0, 2, 0, "X", T0)).state;
    s = unwrap(toggleSuspect(s, ctx, PID, 0, 2, 0, true, T0)).state; // accurate (X is wrong)
    s = unwrap(applyEntry(s, ctx, PID, 0, 2, 0, "T", T0)).state;
    s = unwrap(guessMeta(s, ctx, PID2, "ape", T0, Math.random)).state; // Kris's one guess: right
    // Boards 0 and 2 lock completely and leave the ring. Then each round, each player types the
    // board at their seat and the Capt. rotates, until every board is done.
    const typist: Record<number, string> = { 0: PID, 2: PID2 };
    let now = T0;
    s = rotateLeft(s, now);
    expect(s.boardAtSeat).not.toContain(0);
    expect(s.boardAtSeat).not.toContain(2);
    while (s.status !== "ended") {
      now += 30_000;
      for (const pid of [PID, PID2]) {
        const board = s.boardAtSeat[s.players[pid].seat];
        if (board === null) continue;
        s = typeBoard(s, ctx, pid, board, now);
        typist[board] = pid;
      }
      s = rotateLeft(s, now);
    }
    expect(Object.keys(typist).map(Number).sort()).toEqual(boardIndexes(ctx));

    const r = s.result!;
    const clem = r.players.find((p) => p.name === "Clem Leung")!;
    const kris = r.players.find((p) => p.name === "Kris")!;
    const tilesBy = (pid: string) =>
      boardIndexes(ctx).map((b) => (typist[b] === pid ? openCells(ctx, b) : 0));
    const sum = (ns: number[]) => ns.reduce((a, n) => a + n, 0);
    // Clem's two extra keystrokes (the wrong letter and its fix) count as letters, not tiles.
    const clemTiles = sum(tilesBy(PID));
    const krisTiles = sum(tilesBy(PID2));
    expect(clem).toMatchObject({ seat: 0, tiles: clemTiles, tilesByBoard: tilesBy(PID) });
    expect(clem.lettersTyped).toBe(clemTiles + 2);
    expect(clem).toMatchObject({ accurateSuspects: 1, falseSuspects: 0, guesses: [] });
    expect(kris).toMatchObject({ seat: 2, tiles: krisTiles, tilesByBoard: tilesBy(PID2) });
    expect(kris.lettersTyped).toBe(krisTiles);
    expect(kris.guesses).toEqual([{ text: "APE", correct: true, metaNumber: 1, points: 7 }]);
    expect([clem.knockedOut, kris.knockedOut]).toEqual([false, false]);
    expect(clem.rotations + kris.rotations).toBe(s.rotations);
    // The Capt. role passed to the other player after each rotation.
    expect(Math.abs(clem.rotations - kris.rotations)).toBeLessThanOrEqual(1);
    expect(r.mvps.map((m) => [m.emoji, m.names, m.tiles])).toEqual(
      boardIndexes(ctx).map((b) => [
        s.boardEmojis[b].e,
        [typist[b] === PID ? "Clem Leung" : "Kris"],
        openCells(ctx, b),
      ]),
    );
    const byTiles = [
      { seat: 0, name: "Clem Leung", tiles: clemTiles },
      { seat: 2, name: "Kris", tiles: krisTiles },
    ].sort((a, b) => b.tiles - a.tiles);
    expect(r.leaderboard).toEqual(byTiles);
    // Results never carry player ids.
    expect(JSON.stringify(buildHostView(s, ctx, T0, "u"))).not.toContain(PID);
  });

  it("shares a board MVP on a tie and names nobody on a board without credited tiles", () => {
    const s = startedDuo(ctx);
    // Fill every board, then credit board 0's cells alternately and leave one uncredited (9 / 9).
    fillAll(s, ctx);
    const cells = Object.keys(s.boards[0].entries);
    cells.forEach((k, i) => {
      if (i < cells.length - 1) s.boards[0].authors[k] = i % 2 === 0 ? PID : PID2;
    });
    const ended = runPulse(s, ctx, T0 + 1).state;
    expect(ended.status).toBe("ended");
    const [m0, ...others] = ended.result!.mvps;
    expect(m0).toMatchObject({ names: ["Clem Leung", "Kris"], seats: [0, 2], tiles: 9 });
    for (const m of others) expect(m).toMatchObject({ names: [], seats: [], tiles: 0 });
  });
});
