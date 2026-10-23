import { describe, expect, it } from "vitest";
import { boardReceived, rotateRing, shiftRing } from "../ring";

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
      let s: (number | null)[] = start;
      for (let i = 0; i < n; i++) s = shiftRing(s, "R");
      expect(s).toEqual(start);
    }
  });
  it("reports which board a seat receives", () => {
    // Seating card example: seat 0 holds board 0; Left brings board 1, Right brings board 2.
    const seated = [true, false, false];
    expect(boardReceived([0, 1, 2], 0, "L", seated)).toBe(1);
    expect(boardReceived([0, 1, 2], 0, "R", seated)).toBe(2);
  });
});

describe("rotateRing (completed boards left the ring)", () => {
  it("hands a player the next board when the gap would reach them", () => {
    // Alone at seat 0; board 1 is done. Right: seat 0 gets seat 2's board, as usual.
    expect(rotateRing([0, null, 2], "R", [true, false, false])).toEqual([2, 0, null]);
    // Left would bring the gap; the board that comes next that way (board 2) is taken instead.
    expect(rotateRing([0, null, 2], "L", [true, false, false])).toEqual([2, null, 0]);
  });

  it("lets the gap travel when every seat is played", () => {
    expect(rotateRing([0, null, 2], "R", [true, true, true])).toEqual([2, 0, null]);
    expect(rotateRing([0, null, 2], "L", [true, true, true])).toEqual([null, 2, 0]);
  });

  it("takes boards only from seats nobody plays", () => {
    // Seats 0 and 1 played, seat 2 empty (or knocked out); board 0 is done.
    // The shift gives [2, null, 1]; seat 1 then takes board 1 from unplayed seat 2.
    expect(rotateRing([null, 1, 2], "R", [true, true, false])).toEqual([2, 1, null]);
  });
});
