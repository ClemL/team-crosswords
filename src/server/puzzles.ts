import "server-only";
import puzzleFile from "../../data/puzzles-v1.json";
import { splitPuzzle } from "@/game/puzzle";
import type { PublicPuzzle, PuzzleGame, PuzzleSolution } from "@/game/types";
import { puzzleKeys } from "./keys";
import type { Store } from "./store";

export type PuzzleListItem = { id: string; title: string };
export type LoadedPuzzle = { pub: PublicPuzzle; solution: PuzzleSolution };

const cache = new Map<string, LoadedPuzzle>();

/** Writes every puzzle into Redis as public + solution keys (no TTL). Idempotent. */
export async function seedPuzzles(store: Store): Promise<PuzzleListItem[]> {
  const games = puzzleFile as unknown as PuzzleGame[];
  const index: PuzzleListItem[] = games.map((g) => ({ id: g.id, title: g.title }));
  await store.exec(
    [
      ...games.flatMap((g) => {
        const { pub, solution } = splitPuzzle(g);
        return [
          { op: "set" as const, key: puzzleKeys.public(g.id), value: JSON.stringify(pub) },
          { op: "set" as const, key: puzzleKeys.solution(g.id), value: JSON.stringify(solution) },
        ];
      }),
      { op: "set", key: puzzleKeys.index, value: JSON.stringify(index) },
    ],
    { atomic: true },
  );
  cache.clear();
  return index;
}

/** The in-process store starts empty on every boot, so it seeds itself. */
async function ensureSeeded(store: Store): Promise<void> {
  if (store.kind !== "memory") return;
  const [index] = await store.exec([{ op: "get", key: puzzleKeys.index }]);
  if (index === null) await seedPuzzles(store);
}

export async function listPuzzles(store: Store): Promise<PuzzleListItem[]> {
  await ensureSeeded(store);
  const [raw] = await store.exec([{ op: "get", key: puzzleKeys.index }]);
  return raw ? (JSON.parse(raw as string) as PuzzleListItem[]) : [];
}

export async function loadPuzzle(store: Store, id: string): Promise<LoadedPuzzle | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  await ensureSeeded(store);
  const [pub, solution] = await store.exec([
    { op: "get", key: puzzleKeys.public(id) },
    { op: "get", key: puzzleKeys.solution(id) },
  ]);
  if (!pub || !solution) return null;
  const loaded = {
    pub: JSON.parse(pub as string) as PublicPuzzle,
    solution: JSON.parse(solution as string) as PuzzleSolution,
  };
  cache.set(id, loaded);
  return loaded;
}
