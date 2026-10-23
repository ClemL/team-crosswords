import { describe, expect, it } from "vitest";
import { storesUnderTest, uniq } from "./stores";

for (const { name, make } of storesUnderTest()) {
  describe(`Store contract: ${name}`, () => {
    it("gets and sets strings, with NX and expiry", async () => {
      const s = make();
      const k = uniq();
      expect(await s.exec([{ op: "get", key: k }])).toEqual([null]);
      expect(await s.exec([{ op: "set", key: k, value: "a", nx: true, px: 150 }])).toEqual([true]);
      expect(await s.exec([{ op: "set", key: k, value: "b", nx: true, px: 150 }])).toEqual([false]);
      expect(await s.exec([{ op: "get", key: k }])).toEqual(["a"]);
      await new Promise((r) => setTimeout(r, 250));
      expect(await s.exec([{ op: "get", key: k }])).toEqual([null]);
    });

    it("keeps JSON-looking and numeric strings as strings", async () => {
      const s = make();
      const k = uniq();
      await s.exec([
        { op: "set", key: k, value: '{"a":1}' },
        { op: "hset", key: `${k}:h`, values: { n: "12", j: "[1,2]", e: "" } },
      ]);
      const [str, hash] = await s.exec([
        { op: "get", key: k },
        { op: "hgetall", key: `${k}:h` },
      ]);
      expect(str).toBe('{"a":1}');
      expect(hash).toEqual({ n: "12", j: "[1,2]", e: "" });
    });

    it("handles hashes and sets, including missing keys", async () => {
      const s = make();
      const k = uniq();
      const res = await s.exec([
        { op: "hgetall", key: `${k}:missing` },
        { op: "smembers", key: `${k}:missing` },
        { op: "hset", key: `${k}:h`, values: { a: "1", b: "2" } },
        { op: "hdel", key: `${k}:h`, fields: ["a"] },
        { op: "hgetall", key: `${k}:h` },
        { op: "sadd", key: `${k}:s`, members: ["x", "y", "z"] },
        { op: "srem", key: `${k}:s`, members: ["y"] },
        { op: "smembers", key: `${k}:s` },
      ]);
      expect(res[0]).toEqual({});
      expect(res[1]).toEqual([]);
      expect(res[4]).toEqual({ b: "2" });
      expect((res[7] as string[]).sort()).toEqual(["x", "z"]);
    });

    it("runs atomic batches and releases a lock only for its token", async () => {
      const s = make();
      const k = uniq();
      await s.exec(
        [
          { op: "set", key: k, value: "tok", px: 2000 },
          { op: "expire", key: k, seconds: 60 },
        ],
        { atomic: true },
      );
      await s.releaseLock(k, "other");
      expect(await s.exec([{ op: "get", key: k }])).toEqual(["tok"]);
      await s.releaseLock(k, "tok");
      expect(await s.exec([{ op: "get", key: k }])).toEqual([null]);
    });
  });
}
