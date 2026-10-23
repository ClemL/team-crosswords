import type {
  BoardStyle,
  GameResult,
  PlayerRecord,
  RoomState,
  RoomStatus,
  RotationDir,
} from "@/game/types";

/** Room state as it is laid out in Redis (§7.1): strings, hashes and sets. */
export type RedisShape = {
  version: string;
  meta: Record<string, string>;
  seats: Record<string, string>;
  boardAtSeat: string;
  players: Record<string, string>;
  masterCounts: Record<string, string>;
  ready: string[];
  boards: { entries: Record<string, string>; suspects: Record<string, string>; red: string[] }[];
  locked: string[];
  unlocked: string[];
  stats: Record<string, string>;
};

const num = (v: number | null): string => (v === null ? "" : String(v));
const parseNum = (v: string | undefined): number | null =>
  v === undefined || v === "" ? null : Number(v);

export function serializeMeta(s: RoomState): Record<string, string> {
  return {
    puzzleId: s.puzzleId,
    status: s.status,
    createdAt: String(s.createdAt),
    rotations: String(s.rotations),
    cooldownUntil: String(s.cooldownUntil),
    masterPid: s.masterPid ?? "",
    pendingRotationDir: s.pendingRotation?.dir ?? "",
    pendingRotationAt: s.pendingRotation ? String(s.pendingRotation.at) : "",
    tokensIssued: String(s.tokensIssued),
    tokensLeft: String(s.tokensLeft),
    timerStartedAt: num(s.timerStartedAt),
    endedAt: num(s.endedAt),
    metaSolved: JSON.stringify(s.metaSolved),
    metaGuessesLeft: String(s.metaGuessesLeft),
    boardEmojis: JSON.stringify(s.boardEmojis),
    finalCheckAt: num(s.finalCheckAt),
    result: s.result ? JSON.stringify(s.result) : "",
  };
}

/** Fields of the meta hash needed by the polling fast path. */
export function parseMetaLite(meta: Record<string, string>) {
  const at = parseNum(meta.pendingRotationAt);
  const dir = meta.pendingRotationDir as RotationDir | "";
  return {
    status: (meta.status || "lobby") as RoomStatus,
    cooldownUntil: parseNum(meta.cooldownUntil) ?? 0,
    masterPid: meta.masterPid || null,
    pendingRotation: at !== null && dir ? { dir, at } : null,
    timerStartedAt: parseNum(meta.timerStartedAt),
    endedAt: parseNum(meta.endedAt),
  };
}

export function parsePlayers(raw: Record<string, string>): Record<string, PlayerRecord> {
  const out: Record<string, PlayerRecord> = {};
  for (const [pid, json] of Object.entries(raw)) out[pid] = JSON.parse(json) as PlayerRecord;
  return out;
}

export function toRedis(s: RoomState): RedisShape {
  const seats: Record<string, string> = {};
  s.seats.forEach((pid, i) => (seats[String(i)] = pid ?? ""));
  const players: Record<string, string> = {};
  for (const [pid, p] of Object.entries(s.players)) players[pid] = JSON.stringify(p);
  const masterCounts: Record<string, string> = {};
  for (const [pid, n] of Object.entries(s.masterCounts)) masterCounts[pid] = String(n);
  return {
    version: String(s.version),
    meta: serializeMeta(s),
    seats,
    boardAtSeat: JSON.stringify(s.boardAtSeat),
    players,
    masterCounts,
    ready: [...s.ready],
    boards: s.boards.map((b) => ({
      entries: { ...b.entries },
      suspects: { ...b.suspects },
      red: [...b.red],
    })),
    locked: [...s.locked],
    unlocked: [...s.unlocked],
    stats: {
      tokensSpent: String(s.stats.tokensSpent),
      falseSuspects: String(s.stats.falseSuspects),
      accurateSuspects: String(s.stats.accurateSuspects),
      metaWrong: String(s.stats.metaWrong),
    },
  };
}

export function fromRedis(rid: string, r: RedisShape): RoomState {
  const lite = parseMetaLite(r.meta);
  const seatCount = Object.keys(r.seats).length;
  const masterCounts: Record<string, number> = {};
  for (const [pid, n] of Object.entries(r.masterCounts)) masterCounts[pid] = Number(n);
  return {
    rid,
    puzzleId: r.meta.puzzleId,
    status: lite.status,
    version: Number(r.version),
    createdAt: parseNum(r.meta.createdAt) ?? 0,
    rotations: parseNum(r.meta.rotations) ?? 0,
    cooldownUntil: lite.cooldownUntil,
    masterPid: lite.masterPid,
    pendingRotation: lite.pendingRotation,
    tokensIssued: parseNum(r.meta.tokensIssued) ?? 0,
    tokensLeft: parseNum(r.meta.tokensLeft) ?? 0,
    timerStartedAt: lite.timerStartedAt,
    endedAt: lite.endedAt,
    metaSolved: r.meta.metaSolved ? (JSON.parse(r.meta.metaSolved) as RoomState["metaSolved"]) : {},
    metaGuessesLeft: parseNum(r.meta.metaGuessesLeft) ?? 0,
    boardEmojis: JSON.parse(r.meta.boardEmojis || "[]") as BoardStyle[],
    finalCheckAt: parseNum(r.meta.finalCheckAt),
    result: r.meta.result ? (JSON.parse(r.meta.result) as GameResult) : null,
    seats: Array.from({ length: seatCount }, (_, i) => r.seats[String(i)] || null),
    boardAtSeat: JSON.parse(r.boardAtSeat) as number[],
    players: parsePlayers(r.players),
    masterCounts,
    ready: [...r.ready].sort(),
    boards: r.boards.map((b) => ({
      entries: { ...b.entries },
      suspects: { ...b.suspects },
      red: [...b.red].sort(),
    })),
    locked: [...r.locked].sort(),
    unlocked: [...r.unlocked].sort(),
    stats: {
      tokensSpent: Number(r.stats.tokensSpent ?? 0),
      falseSuspects: Number(r.stats.falseSuspects ?? 0),
      accurateSuspects: Number(r.stats.accurateSuspects ?? 0),
      metaWrong: Number(r.stats.metaWrong ?? 0),
    },
  };
}
