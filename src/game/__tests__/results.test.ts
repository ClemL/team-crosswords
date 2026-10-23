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
import { GAME1, makeCtx, PID, PID2, startedDuo, T0, unwrap } from "./helpers";

const ctx = makeCtx(GAME1, { maxPlayers: 2 });
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
    let s = startedDuo(ctx); // Clem in seat 0 (board 0), Kris in seat 1 (board 1)
    s = typeBoard(s, ctx, PID, 0, T0);
    s = typeBoard(s, ctx, PID2, 1, T0);
    // Clem overwrites one of his letters with a wrong one, then fixes it: still his tile.
    s = unwrap(applyEntry(s, ctx, PID, 0, 2, 0, "X", T0)).state;
    s = unwrap(toggleSuspect(s, ctx, PID, 0, 2, 0, true, T0)).state; // accurate (X is wrong)
    s = unwrap(applyEntry(s, ctx, PID, 0, 2, 0, "T", T0)).state;
    s = unwrap(guessMeta(s, ctx, PID2, "ape", T0, Math.random)).state; // Kris's one guess: right
    // Boards 0 and 1 lock completely and leave the ring: Kris (seat 1) gets board 2, Clem none.
    s = rotateLeft(s, T0);
    expect(s.boardAtSeat).toEqual([null, 2, null]);
    s = typeBoard(s, ctx, PID2, 2, T0 + 30_000);
    s = rotateLeft(s, T0 + 30_000);
    expect(s.status).toBe("ended");

    const r = s.result!;
    const clem = r.players.find((p) => p.name === "Clem Leung")!;
    const kris = r.players.find((p) => p.name === "Kris")!;
    // Open cells: board 0 has 19, board 1 has 19, board 2 has 21.
    expect(clem).toMatchObject({ seat: 0, tiles: 19, tilesByBoard: [19, 0, 0], lettersTyped: 21 });
    expect(clem).toMatchObject({ accurateSuspects: 1, falseSuspects: 0, guesses: [] });
    expect(kris).toMatchObject({ seat: 1, tiles: 40, tilesByBoard: [0, 19, 21], lettersTyped: 40 });
    expect(kris.guesses).toEqual([{ text: "APE", correct: true, metaNumber: 1, points: 7 }]);
    expect([clem.knockedOut, kris.knockedOut]).toEqual([false, false]);
    expect(clem.rotations + kris.rotations).toBe(2);
    expect(clem.rotations).toBe(1); // the Capt. role passed to the other player
    expect(r.mvps.map((m) => [m.emoji, m.names, m.tiles])).toEqual([
      [s.boardEmojis[0].e, ["Clem Leung"], 19],
      [s.boardEmojis[1].e, ["Kris"], 19],
      [s.boardEmojis[2].e, ["Kris"], 21],
    ]);
    expect(r.leaderboard).toEqual([
      { seat: 1, name: "Kris", tiles: 40 },
      { seat: 0, name: "Clem Leung", tiles: 19 },
    ]);
    // Results never carry player ids.
    expect(JSON.stringify(buildHostView(s, ctx, T0, "u"))).not.toContain(PID);
  });

  it("shares a board MVP on a tie and names nobody on a board without credited tiles", () => {
    const s = startedDuo(ctx);
    // Fill every board, then credit board 0's cells alternately and leave one uncredited (9 / 9).
    for (const b of [0, 1, 2]) {
      ctx.solution.boards[b].forEach((row, r) =>
        [...row].forEach((ch, col) => {
          if (ch !== "#") s.boards[b].entries[`${r},${col}`] = ch;
        }),
      );
    }
    const cells = Object.keys(s.boards[0].entries);
    cells.forEach((k, i) => {
      if (i < cells.length - 1) s.boards[0].authors[k] = i % 2 === 0 ? PID : PID2;
    });
    const ended = runPulse(s, ctx, T0 + 1).state;
    expect(ended.status).toBe("ended");
    const [m0, m1, m2] = ended.result!.mvps;
    expect(m0).toMatchObject({ names: ["Clem Leung", "Kris"], seats: [0, 1], tiles: 9 });
    expect(m1).toMatchObject({ names: [], seats: [], tiles: 0 });
    expect(m2).toMatchObject({ names: [], tiles: 0 });
  });
});
