import "server-only";
import type { GameCtx } from "@/game/context";
import type { Result } from "@/game/errors";
import { accrueActivity } from "@/game/activity";
import { createRoomState } from "@/game/state";
import { applyDueTransitions, hasDueTransition } from "@/game/transitions";
import type { RoomState } from "@/game/types";
import { serverConfig } from "./config";
import { ApiError } from "./http";
import { roomKeys } from "./keys";
import { acquireLock, releaseLock } from "./lock";
import { loadPuzzle } from "./puzzles";
import { createRoom, loadRoom, normalizeRid, saveRoom } from "./room-repo";
import { parseMetaLite, parsePlayers } from "./serialize";
import { getStore } from "./store";

const rng = Math.random;

function ridOrThrow(raw: string): string {
  const rid = normalizeRid(raw);
  if (!rid) throw new ApiError("NOT_FOUND", "Room not found.");
  return rid;
}

async function gameCtx(puzzleId: string): Promise<GameCtx> {
  const puzzle = await loadPuzzle(getStore(), puzzleId);
  if (!puzzle) throw new ApiError("NOT_FOUND", "Puzzle not found. Has the seed route been run?");
  return { puzzle: puzzle.pub, solution: puzzle.solution, cfg: serverConfig() };
}

export async function createRoomForPuzzle(puzzleId: string): Promise<string> {
  const cfg = serverConfig();
  const ctx = await gameCtx(puzzleId);
  const now = Date.now();
  const state = await createRoom(
    getStore(),
    (rid) => createRoomState({ rid, puzzle: ctx.puzzle, now, rng, cfg }),
    cfg,
  );
  return state.rid;
}

/**
 * Runs a rule function under the room lock: load → lazy transitions → op → save diff (§7.2).
 * Throws ApiError for rule failures. Transitions are saved even when the op itself is rejected.
 */
export async function mutateRoom<T extends object>(
  rawRid: string,
  op: (state: RoomState, ctx: GameCtx, now: number) => Result<T & { state: RoomState }>,
): Promise<T & { state: RoomState; ctx: GameCtx }> {
  const rid = ridOrThrow(rawRid);
  const store = getStore();
  const cfg = serverConfig();
  const k = roomKeys(rid, cfg.seats);
  const token = await acquireLock(store, k.lock);
  if (!token) throw new ApiError("BUSY", "The room is busy. Try again.");
  try {
    const now = Date.now();
    const loaded = await loadRoom(store, rid, cfg);
    if (!loaded) throw new ApiError("NOT_FOUND", "Room not found.");
    const ctx = await gameCtx(loaded.puzzleId);
    const transitioned = applyDueTransitions(loaded, ctx, now, rng);
    const r = op(transitioned.state, ctx, now);
    if (!r.ok) {
      if (transitioned.changed) await saveRoom(store, loaded, transitioned.state, cfg);
      throw new ApiError(r.error.code, r.error.message);
    }
    const saved = await saveRoom(store, loaded, r.state, cfg);
    return { ...r, state: saved.state, ctx };
  } finally {
    await releaseLock(store, k.lock, token);
  }
}

export type PollResult =
  { notModified: true } | { notModified: false; state: RoomState; ctx: GameCtx };

/**
 * Polling read path (§10). Reads only version, meta and players unless a deadline has passed or
 * the version moved. Records the player's activity without bumping the version.
 */
export async function pollRoom(
  rawRid: string,
  pid: string | null,
  since: number | null,
): Promise<PollResult> {
  const rid = ridOrThrow(rawRid);
  const store = getStore();
  const cfg = serverConfig();
  const k = roomKeys(rid, cfg.seats);
  const now = Date.now();
  const [rawVersion, rawMeta, rawPlayers] = await store.exec([
    { op: "get", key: k.version },
    { op: "hgetall", key: k.meta },
    { op: "hgetall", key: k.players },
  ]);
  if (rawVersion === null || !(rawMeta as Record<string, string>).puzzleId) {
    throw new ApiError("NOT_FOUND", "Room not found.");
  }
  const players = parsePlayers(rawPlayers as Record<string, string>);
  if (pid !== null && !players[pid]) throw new ApiError("NOT_IN_ROOM", "You are not in this room.");
  const lite = parseMetaLite(rawMeta as Record<string, string>);

  let version = Number(rawVersion);
  let state: RoomState | null = null;
  if (hasDueTransition({ ...lite, players }, now, cfg)) {
    const token = await acquireLock(store, k.lock);
    if (token) {
      try {
        const loaded = await loadRoom(store, rid, cfg);
        if (loaded) {
          const ctx = await gameCtx(loaded.puzzleId);
          const t = applyDueTransitions(loaded, ctx, now, rng);
          state = t.changed ? (await saveRoom(store, loaded, t.state, cfg)).state : loaded;
          version = state.version;
        }
      } finally {
        await releaseLock(store, k.lock, token);
      }
    }
    // Lock unavailable: proceed read-only; the lock holder applies the transition.
  }

  if (pid !== null) {
    const base = state?.players[pid] ?? players[pid];
    const out = (state ?? lite).knockedOut[pid];
    const updated = accrueActivity(base, state ?? lite, now, cfg, out);
    await store.exec([{ op: "hset", key: k.players, values: { [pid]: JSON.stringify(updated) } }]);
    if (state) state.players[pid] = updated;
  }

  if (since !== null && since === version) return { notModified: true };
  if (!state) state = await loadRoom(store, rid, cfg);
  if (!state) throw new ApiError("NOT_FOUND", "Room not found.");
  return { notModified: false, state, ctx: await gameCtx(state.puzzleId) };
}
