import { describe, expect, it } from "vitest";
import { maskClue } from "../mask";

const alnum = (s: string) => [...s].filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length;

describe("maskClue", () => {
  it("is deterministic per clue id", () => {
    const a = maskClue("Dining room centerpiece", "B0-5A", 0.5);
    expect(maskClue("Dining room centerpiece", "B0-5A", 0.5)).toBe(a);
    // A different id gives a different pattern for the same text.
    expect(maskClue("Dining room centerpiece", "B1-5A", 0.5)).not.toBe(a);
  });

  it("hides exactly ceil(alnum × (1 − ratio)) letters and digits", () => {
    for (const [text, id] of [
      ["Dining room centerpiece", "B0-5A"],
      ["2,000 pounds", "B1-3D"],
      ['"You bet!"', "B2-8A"],
      ["Be in debt", "B0-1A"],
    ] as const) {
      const masked = maskClue(text, id, 0.5);
      const hidden = [...masked].filter((ch) => ch === "_").length;
      expect(hidden).toBe(Math.ceil(alnum(text) * 0.5));
      expect(masked.length).toBe(text.length);
    }
  });

  it("keeps spaces and punctuation and only replaces alphanumerics", () => {
    const text = 'Spider type: black ___ (e.g., "widow")!';
    const masked = maskClue(text, "B2-3D", 0.5);
    [...text].forEach((ch, i) => {
      if (!/[\p{L}\p{N}]/u.test(ch)) expect(masked[i]).toBe(ch);
      else expect([ch, "_"]).toContain(masked[i]);
    });
  });

  it("respects other reveal ratios", () => {
    expect(maskClue("abcd", "x", 1)).toBe("abcd");
    expect(maskClue("abcd", "x", 0)).toBe("____");
    expect([...maskClue("abcdefghij", "x", 0.7)].filter((c) => c === "_").length).toBe(3);
  });
});
