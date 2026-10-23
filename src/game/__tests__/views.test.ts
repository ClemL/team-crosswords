import { describe, expect, it } from "vitest";
import { joinRoom } from "../lobby";
import { runPulse } from "../pulse";
import { buildHostView, buildPlayerView } from "../views";
import { ALL_GAMES, fillWord, makeCtx, PID, startedRoom, T0, unwrap } from "./helpers";
import { createRoomState } from "../state";
import { mulberry32 } from "../rng";

const ctx = makeCtx();
const answers = ALL_GAMES[0].boards.flatMap((b) => b.clues.map((c) => c.answer));
const metaAnswers = ALL_GAMES[0].metas.map((m) => m.answer);

describe("views", () => {
  it("never include answers, solutions or the text of locked clues", () => {
    const s = startedRoom(ctx);
    const player = JSON.stringify(buildPlayerView(s, ctx, PID, T0));
    const host = JSON.stringify(buildHostView(s, ctx, T0, "https://x/play/TEST"));
    for (const json of [player, host]) {
      for (const a of answers) expect(json).not.toContain(`"${a}"`);
      expect(json).not.toContain("solution");
      for (const a of metaAnswers) expect(json).not.toContain(`"${a}"`);
      expect(json).not.toContain("Be in debt"); // B0-1A is crossLetter-locked
    }
    const view = buildPlayerView(s, ctx, PID, T0);
    const clue = view.board.clues.find((c) => c.id === "B0-1A")!;
    expect(clue).toMatchObject({ unlocked: false, state: "pending", length: 3 });
    expect(clue.text).toMatch(/_/);
    expect(clue.condition).toBe(`Needs ${s.boardEmojis[2].e} r1c1`);
    expect(view.board.clues.find((c) => c.id === "B0-5A")!.condition).toBe(
      "Unlocks at 12 solved (now 0)",
    );
    expect(view.board.clues.find((c) => c.id === "B0-1D")!.condition).toBe(
      "Unlocks at 4 rotations (now 0)",
    );
  });

  it("marks the meta cells of the board with their word number and position", () => {
    const view = buildPlayerView(startedRoom(ctx), ctx, PID, T0);
    // Board 0 holds BETTER's first two letters (r2c2, r3c0) among others.
    expect(view.board.metaCells).toEqual(
      expect.arrayContaining([
        { r: 2, c: 2, meta: 4, slot: 1 },
        { r: 3, c: 0, meta: 4, slot: 2 },
      ]),
    );
    const total = ALL_GAMES[0].metas.flatMap((m) => m.cells).filter(([b]) => b === 0).length;
    expect(view.board.metaCells).toHaveLength(total);
  });

  it("shows only the board at the player's seat", () => {
    const s = startedRoom(ctx);
    s.boards[1].entries["0,0"] = "O";
    s.boardAtSeat = [2, 0, 1];
    const view = buildPlayerView(s, ctx, PID, T0);
    expect(view.board.index).toBe(2);
    expect(view.board.entries).toEqual({});
    expect(view.seating.nextIfLeft.boardIndex).toBe(0);
    expect(view.seating.nextIfRight.boardIndex).toBe(1);
  });

  it("reveals the full clue text once its word locks, even if the clue is still locked", () => {
    let s = startedRoom(ctx);
    fillWord(s, ctx, 0, "B0-1A"); // OWE, crossLetter clue
    s = runPulse(s, ctx, T0).state;
    const clue = buildPlayerView(s, ctx, PID, T0).board.clues.find((c) => c.id === "B0-1A")!;
    expect(clue).toMatchObject({ state: "locked", unlocked: false, text: "Be in debt" });
    expect(clue.condition).toBeUndefined();
  });

  it("host view has no board letters, only locked meta letters", () => {
    let s = startedRoom(ctx);
    s.boards[0].entries["0,2"] = "O";
    fillWord(s, ctx, 0, "B0-5A");
    s = runPulse(s, ctx, T0).state;
    const host = buildHostView(s, ctx, T0, "u");
    expect(host).not.toHaveProperty("board");
    expect(host).not.toHaveProperty("you");
    expect(host.meta.words[3].slots.map((x) => x.letter)).toEqual([
      "B",
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(host.meta.words.every((w) => w.answer === undefined)).toBe(true);
    expect(JSON.stringify(host)).not.toContain('"O"');
  });

  it("does not expose player ids in the seating view", () => {
    let s = createRoomState({
      rid: "T",
      puzzle: ctx.puzzle,
      now: T0,
      rng: mulberry32(1),
      cfg: ctx.cfg,
    });
    s = unwrap(joinRoom(s, ctx, "secret-pid-123", "Clem", T0)).state;
    expect(JSON.stringify(buildHostView(s, ctx, T0, "u"))).not.toContain("secret-pid-123");
  });
});
