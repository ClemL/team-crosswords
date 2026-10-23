import { Redis } from "@upstash/redis";
import { MemoryStore, UpstashStore, type Store } from "../store";

/**
 * Stores under test. The Upstash adapter runs when XW_TEST_UPSTASH_URL points at an
 * Upstash-compatible endpoint (scripts/upstash-shim.ts in front of a real Redis in CI).
 */
export function storesUnderTest(): { name: string; make: () => Store }[] {
  const out: { name: string; make: () => Store }[] = [
    { name: "memory", make: () => new MemoryStore() },
  ];
  const url = process.env.XW_TEST_UPSTASH_URL;
  if (url) {
    out.push({
      name: "upstash",
      make: () =>
        new UpstashStore(
          new Redis({
            url,
            token: process.env.XW_TEST_UPSTASH_TOKEN ?? "dev",
            automaticDeserialization: false,
            enableTelemetry: false,
          }),
        ),
    });
  }
  return out;
}

export const uniq = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
