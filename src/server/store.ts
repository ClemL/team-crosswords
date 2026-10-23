import "server-only";
import { Redis } from "@upstash/redis";

/** The subset of Redis commands the app uses. Results are normalized across backends. */
export type Cmd =
  | { op: "get"; key: string }
  | { op: "set"; key: string; value: string; nx?: boolean; px?: number; ex?: number }
  | { op: "del"; key: string }
  | { op: "hgetall"; key: string }
  | { op: "hset"; key: string; values: Record<string, string> }
  | { op: "hdel"; key: string; fields: string[] }
  | { op: "smembers"; key: string }
  | { op: "sadd"; key: string; members: string[] }
  | { op: "srem"; key: string; members: string[] }
  | { op: "expire"; key: string; seconds: number };

export interface Store {
  readonly kind: "upstash" | "memory";
  /**
   * Runs commands in one round trip. `atomic` uses MULTI/EXEC.
   * Normalized results: get → string | null; set → boolean (false when NX failed);
   * hgetall → Record<string, string>; smembers → string[]; others → number.
   */
  exec(cmds: Cmd[], opts?: { atomic?: boolean }): Promise<unknown[]>;
  /** Deletes `key` only if it still holds `token` (lock release). */
  releaseLock(key: string, token: string): Promise<void>;
}

function toRecord(raw: unknown): Record<string, string> {
  if (raw === null || raw === undefined) return {};
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
    return out;
  }
  if (typeof raw === "object") {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw))
      out[k] = typeof v === "string" ? v : JSON.stringify(v);
    return out;
  }
  return {};
}

function normalize(cmd: Cmd, raw: unknown): unknown {
  switch (cmd.op) {
    case "get":
      return raw === null || raw === undefined
        ? null
        : typeof raw === "string"
          ? raw
          : JSON.stringify(raw);
    case "set":
      return raw === "OK" || raw === true;
    case "hgetall":
      return toRecord(raw);
    case "smembers":
      return Array.isArray(raw) ? raw.map(String) : [];
    default:
      return typeof raw === "number" ? raw : Number(raw ?? 0);
  }
}

// ---- Upstash (production) -------------------------------------------------------------------

const RELEASE_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

class UpstashStore implements Store {
  readonly kind = "upstash" as const;
  constructor(private readonly redis: Redis) {}

  async exec(cmds: Cmd[], opts: { atomic?: boolean } = {}): Promise<unknown[]> {
    if (cmds.length === 0) return [];
    const p = opts.atomic ? this.redis.multi() : this.redis.pipeline();
    for (const c of cmds) {
      switch (c.op) {
        case "get":
          p.get(c.key);
          break;
        case "set":
          if (c.nx && c.px !== undefined) p.set(c.key, c.value, { nx: true, px: c.px });
          else if (c.nx && c.ex !== undefined) p.set(c.key, c.value, { nx: true, ex: c.ex });
          else if (c.nx) p.set(c.key, c.value, { nx: true });
          else if (c.px !== undefined) p.set(c.key, c.value, { px: c.px });
          else if (c.ex !== undefined) p.set(c.key, c.value, { ex: c.ex });
          else p.set(c.key, c.value);
          break;
        case "del":
          p.del(c.key);
          break;
        case "hgetall":
          p.hgetall(c.key);
          break;
        case "hset":
          p.hset(c.key, c.values);
          break;
        case "hdel":
          p.hdel(c.key, ...c.fields);
          break;
        case "smembers":
          p.smembers(c.key);
          break;
        case "sadd": {
          const [first, ...rest] = c.members;
          p.sadd(c.key, first, ...rest);
          break;
        }
        case "srem":
          p.srem(c.key, ...c.members);
          break;
        case "expire":
          p.expire(c.key, c.seconds);
          break;
      }
    }
    const raw = (await p.exec()) as unknown[];
    return raw.map((r, i) => normalize(cmds[i], r));
  }

  async releaseLock(key: string, token: string): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, [key], [token]);
  }
}

// ---- In-process store (local development and end-to-end tests; single process only) ---------

type Entry =
  | { t: "string"; v: string; exp: number | null }
  | { t: "hash"; v: Map<string, string>; exp: number | null }
  | { t: "set"; v: Set<string>; exp: number | null };

export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private data = new Map<string, Entry>();

  private live(key: string): Entry | undefined {
    const e = this.data.get(key);
    if (e && e.exp !== null && e.exp <= Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }

  private hash(key: string): Map<string, string> {
    const e = this.live(key);
    if (e?.t === "hash") return e.v;
    const v = new Map<string, string>();
    this.data.set(key, { t: "hash", v, exp: null });
    return v;
  }

  private set(key: string): Set<string> {
    const e = this.live(key);
    if (e?.t === "set") return e.v;
    const v = new Set<string>();
    this.data.set(key, { t: "set", v, exp: null });
    return v;
  }

  private dropIfEmpty(key: string): void {
    const e = this.data.get(key);
    if (e && e.t !== "string" && e.v.size === 0) this.data.delete(key);
  }

  private run(c: Cmd): unknown {
    switch (c.op) {
      case "get": {
        const e = this.live(c.key);
        return e?.t === "string" ? e.v : null;
      }
      case "set": {
        if (c.nx && this.live(c.key)) return false;
        const ttl = c.px ?? (c.ex !== undefined ? c.ex * 1000 : undefined);
        this.data.set(c.key, {
          t: "string",
          v: c.value,
          exp: ttl !== undefined ? Date.now() + ttl : null,
        });
        return true;
      }
      case "del":
        return this.data.delete(c.key) ? 1 : 0;
      case "hgetall": {
        const e = this.live(c.key);
        return e?.t === "hash" ? Object.fromEntries(e.v) : {};
      }
      case "hset": {
        const h = this.hash(c.key);
        let added = 0;
        for (const [f, v] of Object.entries(c.values)) {
          if (!h.has(f)) added++;
          h.set(f, v);
        }
        return added;
      }
      case "hdel": {
        const e = this.live(c.key);
        if (e?.t !== "hash") return 0;
        const n = c.fields.filter((f) => e.v.delete(f)).length;
        this.dropIfEmpty(c.key);
        return n;
      }
      case "smembers": {
        const e = this.live(c.key);
        return e?.t === "set" ? [...e.v] : [];
      }
      case "sadd": {
        const s = this.set(c.key);
        const n = c.members.filter((m) => !s.has(m)).length;
        c.members.forEach((m) => s.add(m));
        return n;
      }
      case "srem": {
        const e = this.live(c.key);
        if (e?.t !== "set") return 0;
        const n = c.members.filter((m) => e.v.delete(m)).length;
        this.dropIfEmpty(c.key);
        return n;
      }
      case "expire": {
        const e = this.live(c.key);
        if (!e) return 0;
        e.exp = Date.now() + c.seconds * 1000;
        return 1;
      }
    }
  }

  async exec(cmds: Cmd[]): Promise<unknown[]> {
    // Commands run synchronously, so every batch is atomic in a single process.
    return cmds.map((c) => this.run(c));
  }

  async releaseLock(key: string, token: string): Promise<void> {
    const e = this.live(key);
    if (e?.t === "string" && e.v === token) this.data.delete(key);
  }
}

// ---- Selection ------------------------------------------------------------------------------

const globalForStore = globalThis as unknown as { __xwStore?: Store; __xwStoreWarned?: boolean };

export function storeKind(): "upstash" | "memory" {
  if (process.env.XW_STORE === "memory") return "memory";
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return "upstash";
  if (process.env.NODE_ENV !== "production") return "memory";
  throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
}

export function getStore(): Store {
  if (globalForStore.__xwStore) return globalForStore.__xwStore;
  const kind = storeKind();
  if (kind === "upstash") {
    globalForStore.__xwStore = new UpstashStore(
      new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        automaticDeserialization: false,
        enableTelemetry: false,
      }),
    );
  } else {
    if (!globalForStore.__xwStoreWarned && process.env.XW_STORE !== "memory") {
      console.warn("[store] Upstash env vars missing: using the in-process memory store.");
      globalForStore.__xwStoreWarned = true;
    }
    globalForStore.__xwStore = new MemoryStore();
  }
  return globalForStore.__xwStore;
}

/** Test hook: replace the store. */
export function setStoreForTests(store: Store | undefined): void {
  globalForStore.__xwStore = store;
}

export { UpstashStore };
