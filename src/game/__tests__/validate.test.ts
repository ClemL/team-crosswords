import { describe, expect, it } from "vitest";
import { validateGame, validatePuzzleSet } from "../validate";
import type { PuzzleGame } from "../types";
import { ALL_GAMES } from "./helpers";

const copy = (): PuzzleGame => structuredClone(ALL_GAMES[0]);

describe("puzzle validator", () => {
  it("accepts all provided games", () => {
    for (const r of validatePuzzleSet(ALL_GAMES)) expect(r.errors).toEqual([]);
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
    ["shaded count", (g: PuzzleGame) => g.boards[0].shaded.pop()],
    ["meta mismatch", (g: PuzzleGame) => (g.meta.answer = "BUTTER")],
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

  it("rejects duplicate answers within a game", () => {
    const g = copy();
    g.boards[1].clues[0].answer = "OWE";
    expect(validateGame(g).errors.join("\n")).toContain("duplicate answer OWE");
  });
});
