import { describe, expect, it } from "vitest";
import { simulateSolve, validateGame, validatePuzzleSet } from "../validate";
import type { PuzzleGame } from "../types";
import { ALL_GAMES, SEVEN_GAMES, SIX_GAMES } from "./helpers";

const copy = (): PuzzleGame => structuredClone(ALL_GAMES[0]);

describe("puzzle validator", () => {
  it("accepts all provided games: five 5×5 boards each, one per player", () => {
    for (const r of validatePuzzleSet(ALL_GAMES)) expect(r.errors).toEqual([]);
    for (const g of ALL_GAMES) expect(g.boards).toHaveLength(5);
  });

  it.each([
    ["layout size", (g: PuzzleGame) => (g.boards[0].layout[0] = "##..")],
    ["black cells differ", (g: PuzzleGame) => (g.boards[0].solution[0] = "#XOWE".slice(1) + "#")],
    ["answer mismatch", (g: PuzzleGame) => (g.boards[0].clues[1].answer = "GREY")],
    ["non-contiguous", (g: PuzzleGame) => (g.boards[0].clues[1].cells[1] = [1, 3])],
    ["numbering", (g: PuzzleGame) => (g.boards[0].clues[1].num = 9)],
    ["duplicate id", (g: PuzzleGame) => (g.boards[1].clues[0].id = "B0-1A")],
    [
      "crossLetter same board",
      (g: PuzzleGame) =>
        (g.boards[0].clues[0].unlock = { type: "crossLetter", board: 0, cell: [2, 2] }),
    ],
    [
      "crossLetter black cell",
      (g: PuzzleGame) =>
        (g.boards[0].clues[0].unlock = { type: "crossLetter", board: 1, cell: [0, 4] }),
    ],
    [
      "crossLetter out of range",
      (g: PuzzleGame) =>
        (g.boards[0].clues[0].unlock = { type: "crossLetter", board: 5, cell: [0, 0] }),
    ],
    ["meta count", (g: PuzzleGame) => g.metas.pop()],
    ["meta letters", (g: PuzzleGame) => (g.metas[3].answer = "BUTTER")],
    [
      "meta same length",
      (g: PuzzleGame) => {
        g.metas[0] = { ...g.metas[0], answer: "BEDS", enumeration: "(4)", cells: g.metas[1].cells };
      },
    ],
    ["meta shared cell", (g: PuzzleGame) => (g.metas[0].cells[0] = g.metas[3].cells[0])],
    [
      "meta on one board",
      (g: PuzzleGame) => {
        // NET: board 0, r4c0–r4c2 — a valid spelling, but from one board only.
        g.metas[0] = {
          ...g.metas[0],
          answer: "NET",
          cells: [
            [0, 4, 0],
            [0, 4, 1],
            [0, 4, 2],
          ],
        };
      },
    ],
    [
      "too few base",
      (g: PuzzleGame) =>
        g.boards[0].clues.forEach((c) => (c.unlock = { type: "rotations", atLeast: 1 })),
    ],
    ["coverage", (g: PuzzleGame) => g.boards[0].clues.splice(1, 1)],
    [
      "unsolvable",
      (g: PuzzleGame) => {
        for (const b of g.boards)
          for (const c of b.clues) if (c.unlock.type === "rotations") c.unlock.atLeast = 50;
        for (const b of g.boards)
          for (const c of b.clues) if (c.unlock.type === "solvedCount") c.unlock.atLeast = 99;
        for (const b of g.boards)
          for (const c of b.clues)
            if (c.unlock.type === "crossLetter") c.unlock = { type: "rotations", atLeast: 50 };
        for (const b of g.boards)
          for (const c of b.clues)
            if (c.unlock.type === "base" && c.dir === "D")
              c.unlock = { type: "rotations", atLeast: 50 };
      },
    ],
  ])("rejects: %s", (_name, mutate) => {
    const g = copy();
    mutate(g);
    expect(validateGame(g).errors.length).toBeGreaterThan(0);
  });

  it("accepts the 6× set: six 6×6 boards, 6 meta words of 3–8 letters, par 6, solvable in 2–4", () => {
    expect(SIX_GAMES).toHaveLength(10);
    for (const r of validatePuzzleSet([...ALL_GAMES, ...SIX_GAMES])) expect(r.errors).toEqual([]);
    for (const g of SIX_GAMES) {
      expect(g).toMatchObject({ boardSize: 6, parMinutes: 6 });
      expect(g.boards).toHaveLength(6);
      expect(g.metas.map((m) => m.answer.length)).toEqual([3, 4, 5, 6, 7, 8]);
      expect(simulateSolve(g)).toBeGreaterThanOrEqual(2);
      expect(simulateSolve(g)).toBeLessThanOrEqual(4);
    }
  });

  it("accepts the 7× set: seven 7×7 boards, 7 meta words of 3–9 letters, par 7, solvable in 2–4", () => {
    expect(SEVEN_GAMES).toHaveLength(10);
    const all = [...ALL_GAMES, ...SIX_GAMES, ...SEVEN_GAMES];
    for (const r of validatePuzzleSet(all)) expect(r.errors).toEqual([]);
    for (const g of SEVEN_GAMES) {
      expect(g).toMatchObject({ boardSize: 7, parMinutes: 7 });
      expect(g.boards).toHaveLength(7);
      expect(g.metas.map((m) => m.answer.length)).toEqual([3, 4, 5, 6, 7, 8, 9]);
      const rotations = simulateSolve(g)!;
      expect(rotations).toBeGreaterThanOrEqual(2);
      expect(rotations).toBeLessThanOrEqual(4);
    }
  });

  it("checks a game against its mode", () => {
    const six = structuredClone(SIX_GAMES[0]);
    six.parMinutes = 5;
    expect(validateGame(six).errors).toContain("parMinutes should be 6 for 6x");
    const short = structuredClone(SIX_GAMES[0]);
    short.metas.pop();
    expect(validateGame(short).errors).toContain("expected 6 meta words, found 5");
    const odd = copy();
    odd.boardSize = 8;
    expect(validateGame(odd).errors).toContain("no game mode has 8×8 boards");
  });

  it("rejects duplicate answers within a game", () => {
    const g = copy();
    g.boards[1].clues[0].answer = "OWE";
    expect(validateGame(g).errors.join("\n")).toContain("duplicate answer OWE");
  });

  it("lets a 7× game repeat a 3-letter answer on another board, never on the same one", () => {
    const threes = (g: PuzzleGame, b: number) =>
      g.boards[b].clues.filter((c) => c.answer.length === 3);
    const other = structuredClone(SEVEN_GAMES[0]);
    const word = threes(other, 0)[0].answer;
    threes(other, 1)[0].answer = word;
    expect(validateGame(other).errors.join("\n")).not.toContain(`duplicate answer ${word}`);

    const same = structuredClone(SEVEN_GAMES[0]);
    const [a, b] = threes(same, 0);
    b.answer = a.answer;
    expect(validateGame(same).errors.join("\n")).toContain(`duplicate answer ${a.answer}`);

    // Longer answers stay unique across the game.
    const long = structuredClone(SEVEN_GAMES[0]);
    const seven = long.boards[0].clues.find((c) => c.answer.length === 7)!.answer;
    long.boards[1].clues.find((c) => c.answer.length === 7)!.answer = seven;
    expect(validateGame(long).errors.join("\n")).toContain(`duplicate answer ${seven}`);
  });
});
