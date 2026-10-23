import { describe, expect, it } from "vitest";
import { CONFIG_V1 } from "@/config";
import { initialMasterCount, masterNeedsReplacement, pickNextMaster } from "../master";
import { mulberry32 } from "../rng";
import type { PlayerRecord } from "../types";

const cfg = { ...CONFIG_V1 };
const NOW = 10_000_000;
const player = (seat: number, lastSeen = NOW): PlayerRecord => ({
  name: `P${seat}`,
  initials: `P${seat}`,
  seat,
  joinedAt: 0,
  lastSeen,
  activeSeconds: 0,
});

describe("pickNextMaster", () => {
  it("chooses among active players with the fewest master assignments", () => {
    const state = {
      players: { a: player(0), b: player(1), c: player(2) },
      masterPid: "a",
      masterCounts: { a: 1, b: 3, c: 1 },
    };
    for (let seed = 0; seed < 20; seed++) {
      expect(pickNextMaster(state, NOW, mulberry32(seed), cfg)).toBe("c");
    }
  });

  it("excludes the current master even when they have the fewest assignments", () => {
    const state = {
      players: { a: player(0), b: player(1), c: player(2) },
      masterPid: "a",
      masterCounts: { a: 0, b: 2, c: 2 },
    };
    const picks = new Set(
      Array.from({ length: 40 }, (_, s) => pickNextMaster(state, NOW, mulberry32(s), cfg)),
    );
    expect(picks).toEqual(new Set(["b", "c"]));
  });

  it("keeps the only active player as master (single-player fallback)", () => {
    const state = { players: { a: player(0) }, masterPid: "a", masterCounts: { a: 5 } };
    expect(pickNextMaster(state, NOW, mulberry32(1), cfg)).toBe("a");
  });

  it("excludes inactive players", () => {
    const stale = NOW - cfg.inactiveAfterMs - 1;
    const state = {
      players: { a: player(0), b: player(1, stale), c: player(2) },
      masterPid: "a",
      masterCounts: { a: 3, b: 0, c: 2 },
    };
    expect(pickNextMaster(state, NOW, mulberry32(1), cfg)).toBe("c");
    // With everyone else inactive, the current master stays.
    const alone = { ...state, players: { a: player(0), b: player(1, stale), c: player(2, stale) } };
    expect(pickNextMaster(alone, NOW, mulberry32(1), cfg)).toBe("a");
  });

  it("flags an inactive master for replacement only when someone else is active", () => {
    const stale = NOW - cfg.inactiveAfterMs - 1;
    expect(
      masterNeedsReplacement(
        { players: { a: player(0, stale), b: player(1) }, masterPid: "a" },
        NOW,
        cfg,
      ),
    ).toBe(true);
    expect(
      masterNeedsReplacement({ players: { a: player(0, stale) }, masterPid: "a" }, NOW, cfg),
    ).toBe(false);
    expect(
      masterNeedsReplacement({ players: { a: player(0), b: player(1) }, masterPid: "a" }, NOW, cfg),
    ).toBe(false);
  });
});

describe("initialMasterCount (late joiner)", () => {
  it("starts at the minimum count among active players", () => {
    const stale = NOW - cfg.inactiveAfterMs - 1;
    const state = {
      players: { a: player(0), b: player(1), c: player(2, stale) },
      masterCounts: { a: 4, b: 2, c: 0 },
    };
    expect(initialMasterCount(state, NOW, cfg)).toBe(2);
    expect(initialMasterCount({ players: {}, masterCounts: {} }, NOW, cfg)).toBe(0);
  });
});
