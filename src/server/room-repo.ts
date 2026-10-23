import "server-only";
import { randomInt } from "node:crypto";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type GameConfig } from "@/config";
import { allRoomStateKeys, roomKeys, type RoomKeys } from "./keys";
import { fromRedis, toRedis, type RedisShape } from "./serialize";
import type { Cmd, Store } from "./store";
import type { RoomState } from "@/game/types";

export function normalizeRid(raw: string): string | null {
  const rid = raw.toUpperCase();
  if (rid.length !== ROOM_CODE_LENGTH) return null;
  return [...rid].every((ch) => ROOM_CODE_ALPHABET.includes(ch)) ? rid : null;
}

export function randomRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++)
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

/** Loads the whole room in one pipelined round trip. */
export async function loadRoom(
  store: Store,
  rid: string,
  cfg: GameConfig,
): Promise<RoomState | null> {
  const k = roomKeys(rid, cfg.seats);
  const cmds: Cmd[] = [
    { op: "get", key: k.version },
    { op: "hgetall", key: k.meta },
    { op: "hgetall", key: k.seats },
    { op: "get", key: k.boardAtSeat },
    { op: "hgetall", key: k.players },
    { op: "hgetall", key: k.masterCounts },
    { op: "hgetall", key: k.playerStats },
    { op: "smembers", key: k.ready },
    ...k.boards.flatMap((b): Cmd[] => [
      { op: "hgetall", key: b.entries },
      { op: "hgetall", key: b.authors },
      { op: "hgetall", key: b.suspects },
    ]),
    { op: "smembers", key: k.locked },
    { op: "smembers", key: k.unlocked },
    { op: "hgetall", key: k.stats },
  ];
  const res = await store.exec(cmds);
  const version = res[0] as string | null;
  const meta = res[1] as Record<string, string>;
  const boardAtSeat = res[3] as string | null;
  if (version === null || !meta.puzzleId || boardAtSeat === null) return null;
  const head = 8;
  const boards: RedisShape["boards"] = k.boards.map((_, n) => ({
    entries: res[head + n * 3] as Record<string, string>,
    authors: res[head + 1 + n * 3] as Record<string, string>,
    suspects: res[head + 2 + n * 3] as Record<string, string>,
  }));
  const tail = head + k.boards.length * 3;
  return fromRedis(rid, {
    version,
    meta,
    seats: res[2] as Record<string, string>,
    boardAtSeat,
    players: res[4] as Record<string, string>,
    masterCounts: res[5] as Record<string, string>,
    playerStats: res[6] as Record<string, string>,
    ready: res[7] as string[],
    boards,
    locked: res[tail] as string[],
    unlocked: res[tail + 1] as string[],
    stats: res[tail + 2] as Record<string, string>,
  });
}

function hashDiff(
  key: string,
  before: Record<string, string>,
  after: Record<string, string>,
): Cmd[] {
  const values: Record<string, string> = {};
  for (const [f, v] of Object.entries(after)) if (before[f] !== v) values[f] = v;
  const fields = Object.keys(before).filter((f) => !(f in after));
  const out: Cmd[] = [];
  if (Object.keys(values).length > 0) out.push({ op: "hset", key, values });
  if (fields.length > 0) out.push({ op: "hdel", key, fields });
  return out;
}

function setDiff(key: string, before: string[], after: string[]): Cmd[] {
  const b = new Set(before);
  const a = new Set(after);
  const add = [...a].filter((m) => !b.has(m));
  const rem = [...b].filter((m) => !a.has(m));
  const out: Cmd[] = [];
  if (add.length > 0) out.push({ op: "sadd", key, members: add });
  if (rem.length > 0) out.push({ op: "srem", key, members: rem });
  return out;
}

/** Commands that turn `before` into `after` (version excluded). `before = null` writes everything. */
export function diffCommands(k: RoomKeys, before: RedisShape | null, after: RedisShape): Cmd[] {
  const empty: RedisShape = {
    version: "",
    meta: {},
    seats: {},
    boardAtSeat: "",
    players: {},
    masterCounts: {},
    playerStats: {},
    ready: [],
    boards: after.boards.map(() => ({ entries: {}, authors: {}, suspects: {} })),
    locked: [],
    unlocked: [],
    stats: {},
  };
  const b = before ?? empty;
  const cmds: Cmd[] = [
    ...hashDiff(k.meta, b.meta, after.meta),
    ...hashDiff(k.seats, b.seats, after.seats),
    ...(b.boardAtSeat !== after.boardAtSeat
      ? [{ op: "set", key: k.boardAtSeat, value: after.boardAtSeat } as Cmd]
      : []),
    ...hashDiff(k.players, b.players, after.players),
    ...hashDiff(k.masterCounts, b.masterCounts, after.masterCounts),
    ...hashDiff(k.playerStats, b.playerStats, after.playerStats),
    ...setDiff(k.ready, b.ready, after.ready),
    ...after.boards.flatMap((ab, n) => [
      ...hashDiff(k.boards[n].entries, b.boards[n].entries, ab.entries),
      ...hashDiff(k.boards[n].suspects, b.boards[n].suspects, ab.suspects),
      ...hashDiff(k.boards[n].authors, b.boards[n].authors, ab.authors),
    ]),
    ...setDiff(k.locked, b.locked, after.locked),
    ...setDiff(k.unlocked, b.unlocked, after.unlocked),
    ...hashDiff(k.stats, b.stats, after.stats),
  ];
  return cmds;
}

/**
 * Saves `after` if it differs from `before`: writes the diff, bumps the version and refreshes the
 * TTL of every room key, all in one MULTI. Returns the saved state (with its new version).
 */
export async function saveRoom(
  store: Store,
  before: RoomState | null,
  after: RoomState,
  cfg: GameConfig,
): Promise<{ state: RoomState; changed: boolean }> {
  const k = roomKeys(after.rid, cfg.seats);
  const baseVersion = before?.version ?? after.version;
  const cmds = diffCommands(
    k,
    before ? toRedis(before) : null,
    toRedis({ ...after, version: baseVersion }),
  );
  if (cmds.length === 0) return { state: before ?? after, changed: false };
  const version = before ? baseVersion + 1 : after.version;
  cmds.push({ op: "set", key: k.version, value: String(version) });
  for (const key of allRoomStateKeys(k))
    cmds.push({ op: "expire", key, seconds: cfg.roomTtlSeconds });
  await store.exec(cmds, { atomic: true });
  return { state: { ...after, version }, changed: true };
}

/** Creates a room with a fresh, collision-free code (claimed with SET NX). */
export async function createRoom(
  store: Store,
  make: (rid: string) => RoomState,
  cfg: GameConfig,
): Promise<RoomState> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const rid = randomRoomCode();
    const k = roomKeys(rid, cfg.seats);
    const [claimed] = await store.exec([
      { op: "set", key: k.version, value: "0", nx: true, ex: cfg.roomTtlSeconds },
    ]);
    if (!claimed) continue;
    const state = make(rid);
    await saveRoom(store, null, { ...state, version: 0 }, cfg);
    return state;
  }
  throw new Error("Could not allocate a room code");
}
