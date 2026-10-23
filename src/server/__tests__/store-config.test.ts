import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyUpstashError, storeKind, StoreError, upstashEnv } from "../store";

afterEach(() => vi.unstubAllEnvs());

function stubEnv(vars: Record<string, string | undefined>) {
  for (const name of [
    "XW_STORE",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ]) {
    vi.stubEnv(name, vars[name] ?? "");
  }
  vi.stubEnv("NODE_ENV", vars.NODE_ENV ?? "production");
}

describe("store configuration", () => {
  it("accepts the Vercel Marketplace KV_REST_API_* names as a fallback", () => {
    stubEnv({ KV_REST_API_URL: "https://x.upstash.io", KV_REST_API_TOKEN: "t" });
    expect(upstashEnv()).toEqual({ url: "https://x.upstash.io", token: "t" });
    expect(storeKind()).toBe("upstash");
  });

  it("prefers UPSTASH_REDIS_REST_* and trims whitespace", () => {
    stubEnv({
      UPSTASH_REDIS_REST_URL: " https://a.upstash.io\n",
      UPSTASH_REDIS_REST_TOKEN: "a ",
      KV_REST_API_URL: "https://b.upstash.io",
      KV_REST_API_TOKEN: "b",
    });
    expect(upstashEnv()).toEqual({ url: "https://a.upstash.io", token: "a" });
  });

  it("names the missing variables in production", () => {
    stubEnv({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io" });
    try {
      storeKind();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(StoreError);
      expect((e as StoreError).code).toBe("STORE_NOT_CONFIGURED");
      expect((e as StoreError).publicMessage).toContain("UPSTASH_REDIS_REST_TOKEN");
      expect((e as StoreError).publicMessage).not.toContain("UPSTASH_REDIS_REST_URL and");
    }
  });

  it("rejects a redis:// connection string where the REST URL belongs", () => {
    stubEnv({
      UPSTASH_REDIS_REST_URL: "rediss://default:pw@x.upstash.io:6379",
      UPSTASH_REDIS_REST_TOKEN: "t",
    });
    expect(() => storeKind()).toThrow(/REST URL/);
  });

  it("falls back to the memory store only outside production", () => {
    stubEnv({ NODE_ENV: "development" });
    expect(storeKind()).toBe("memory");
    stubEnv({ XW_STORE: "memory" });
    expect(storeKind()).toBe("memory");
  });
});

describe("classifyUpstashError", () => {
  const secret = '[["set","puzzle:v1-01:solution","{\\"boards\\":[[\\"##OWE\\"]]}"]]';
  it.each([
    ["WRONGPASS invalid or missing auth token", /rejected the token/],
    ["NOPERM this user has no permissions to run the 'set' command", /read-only/],
    ["fetch failed", /Could not reach/],
    ["something else", /database returned an error/],
  ])("%s", (msg, expected) => {
    const err = classifyUpstashError(new Error(`${msg}, command was: ${secret}`));
    expect(err.code).toBe("STORE_UNAVAILABLE");
    expect(err.publicMessage).toMatch(expected);
    expect(err.publicMessage).not.toContain("OWE");
    expect(err.logDetail).not.toContain("OWE");
  });
});
