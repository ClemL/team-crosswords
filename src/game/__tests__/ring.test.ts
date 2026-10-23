import { describe, expect, it } from "vitest";
import { boardReceived, shiftRing } from "../ring";

describe("shiftRing", () => {
  it("rotates right for n = 3: board at seat i moves to seat i + 1", () => {
    expect(shiftRing([0, 1, 2], "R")).toEqual([2, 0, 1]);
  });
  it("rotates left for n = 3: board at seat i moves to seat i − 1", () => {
    expect(shiftRing([0, 1, 2], "L")).toEqual([1, 2, 0]);
  });
  it("rotates right and left for n = 6", () => {
    expect(shiftRing([0, 1, 2, 3, 4, 5], "R")).toEqual([5, 0, 1, 2, 3, 4]);
    expect(shiftRing([0, 1, 2, 3, 4, 5], "L")).toEqual([1, 2, 3, 4, 5, 0]);
  });
  it("is reversible and returns to start after n shifts", () => {
    for (const n of [3, 6]) {
      const start = Array.from({ length: n }, (_, i) => i);
      expect(shiftRing(shiftRing(start, "L"), "R")).toEqual(start);
      let s = start;
      for (let i = 0; i < n; i++) s = shiftRing(s, "R");
      expect(s).toEqual(start);
    }
  });
  it("reports which board a seat receives", () => {
    // Seating card example: seat 0 holds board 0; Left brings board 1, Right brings board 2.
    expect(boardReceived([0, 1, 2], 0, "L")).toBe(1);
    expect(boardReceived([0, 1, 2], 0, "R")).toBe(2);
  });
});
