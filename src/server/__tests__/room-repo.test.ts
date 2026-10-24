import { describe, expect, it } from "vitest";
import { CONFIG_V1 } from "@/config";
import { applyEntry } from "@/game/entry";
import { joinRoom, markReady } from "@/game/lobby";
import { guessMeta } from "@/game/meta";
import { runPulse } from "@/game/pulse";
import { mulberry32 } from "@/game/rng";
import { createRoomState } from "@/game/state";
import { toggleSuspect } from "@/game/suspect";
import type { RoomState } from "@/game/types";
import { fillWord, makeCtx, unwrap } from "@/game/__tests__/helpers";
import { createRoom, loadRoom, saveRoom } from "../room-repo";
import { storesUnderTest } from "./stores";

const cfg = { ...CONFIG_V1 };

/** Sets come back from Redis in arbitrary order; compare them sorted. */
const norm = (s: RoomState): RoomState => ({
  ...s,
  ready: [...s.ready].sort(),
  locked: [...s.locked].sort(),
  unlocked: [...s.unlocked].sort(),
});
const ctx = makeCtx();
const PID = "pid-repo-test";

for (const { name, make } of storesUnderTest()) {
  describe(`room repository: ${name}`, () => {
    it("round-trips a room through Redis and saves only diffs", async () => {
      const store = make();
      const now = Date.now();
      const created = await createRoom(
        store,
        (rid) => createRoomState({ rid, puzzle: ctx.puzzle, now, rng: mulberry32(5), cfg }),
        cfg,
      );
      const loaded = (await loadRoom(store, created.rid, cfg))!;
      expect(loaded).toEqual(norm({ ...created, version: 0 }));

      let next = unwrap(joinRoom(loaded, ctx, PID, "Clem Leung", now)).state;
      next = unwrap(markReady(next, ctx, PID, now)).state;
      next = unwrap(applyEntry(next, ctx, PID, 0, 2, 0, "T", now)).state;
      next = unwrap(toggleSuspect(next, ctx, PID, 0, 2, 0, true, now)).state;
      next = unwrap(guessMeta(next, ctx, PID, "water", now, Math.random)).state;
      fillWord(next, ctx, 0, "B0-4A");
      next = runPulse(next, ctx, now).state;
      next.knockedOut = { "p-out": now };
      next.boardAtSeat = [0, null, 2, 3, 4];
      const saved = await saveRoom(store, loaded, next, cfg);
      expect(saved.changed).toBe(true);
      expect(saved.state.version).toBe(1);

      const again = (await loadRoom(store, created.rid, cfg))!;
      expect(again).toEqual(norm(saved.state));
      expect(again.boards[0].entries["2,0"]).toBe("T");
      expect(again.boards[0].suspects).toEqual({ "2,0": PID });
      expect(again.locked).toEqual(["B0-4A"]);
      expect(again.metaSolved).toEqual({ M3: { at: now, rotations: 0, by: "guess", seat: 0 } });
      expect(again.boards[0].authors["2,0"]).toBe(PID);
      expect(again.playerStats[PID]).toMatchObject({
        lettersTyped: 1,
        guesses: [{ text: "WATER", metaId: "M3" }],
      });
      expect(again.knockedOut).toEqual({ "p-out": now });
      expect(again.boardAtSeat).toEqual([0, null, 2, 3, 4]);
      // Read with the largest ring (seven boards), or with a smaller guess than the room's five.
      expect(again.boards).toHaveLength(5);
      expect(await loadRoom(store, created.rid, { ...cfg, seats: 3 })).toEqual(again);

      // A save without changes does not bump the version.
      const noop = await saveRoom(store, again, structuredClone(again), cfg);
      expect(noop.changed).toBe(false);
      expect((await loadRoom(store, created.rid, cfg))!.version).toBe(1);

      // Clearing an entry deletes the hash field.
      const cleared = unwrap(applyEntry(again, ctx, PID, 0, 2, 0, "", now)).state;
      await saveRoom(store, again, cleared, cfg);
      expect((await loadRoom(store, created.rid, cfg))!.boards[0].entries["2,0"]).toBeUndefined();
    });

    it("returns null for unknown rooms", async () => {
      expect(await loadRoom(make(), "ZZZZ", cfg)).toBeNull();
    });
  });
}
