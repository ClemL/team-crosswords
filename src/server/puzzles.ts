import "server-only";
import fiveFile from "../../data/puzzles-v1.json";
import sixFile from "../../data/puzzles-6x.json";
import { MODES, modeForSize, type Mode } from "@/config";
import { splitPuzzle } from "@/game/puzzle";
import type { PublicPuzzle, PuzzleGame, PuzzleSolution } from "@/game/types";
import { puzzleKeys } from "./keys";
import type { Store } from "./store";

export type PuzzleListItem = {
  id: string;
  title: string;
  mode: Mode;
  boardSize: number;
  metaWords: number;
  parMinutes: number;
};

/** Every game of every mode: 5x (data/puzzles-v1.json) and 6x (data/puzzles-6x.json). */
export const ALL_PUZZLES = [...fiveFile, ...sixFile] as unknown as PuzzleGame[];

/** Bumped whenever the stored puzzle shape changes; older seeds must be re-seeded. */
export const PUZZLE_FORMAT = 3;
type PuzzleIndex = { format: number; puzzles: PuzzleListItem[] };

/** Parses the stored index. Returns null when missing; `stale` when seeded by an older version. */
export function parseIndex(raw: unknown): { puzzles: PuzzleListItem[]; stale: boolean } | null {
  if (typeof raw !== "string") return null;
  const parsed = JSON.parse(raw) as PuzzleIndex | PuzzleListItem[];
  if (Array.isArray(parsed) || parsed.format !== PUZZLE_FORMAT) return { puzzles: [], stale: true };
  return { puzzles: parsed.puzzles, stale: false };
}
export type LoadedPuzzle = { pub: PublicPuzzle; solution: PuzzleSolution };

const cache = new Map<string, LoadedPuzzle>();

/** Writes every puzzle into Redis as public + solution keys (no TTL). Idempotent. */
export async function seedPuzzles(store: Store): Promise<PuzzleListItem[]> {
  const games = ALL_PUZZLES;
  const index: PuzzleListItem[] = games.map((g) => {
    const mode = modeForSize(g.boardSize) ?? "5x";
    return {
      id: g.id,
      title: g.title,
      mode,
      boardSize: g.boardSize,
      metaWords: MODES[mode].metaWords,
      parMinutes: g.parMinutes,
    };
  });
  await store.exec(
    [
      ...games.flatMap((g) => {
        const { pub, solution } = splitPuzzle(g);
        return [
          { op: "set" as const, key: puzzleKeys.public(g.id), value: JSON.stringify(pub) },
          { op: "set" as const, key: puzzleKeys.solution(g.id), value: JSON.stringify(solution) },
        ];
      }),
      {
        op: "set",
        key: puzzleKeys.index,
        value: JSON.stringify({ format: PUZZLE_FORMAT, puzzles: index } satisfies PuzzleIndex),
      },
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
  return parseIndex(raw)?.puzzles ?? [];
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
  // Seeded by an older version (single meta word): treat as not seeded.
  if (!Array.isArray(loaded.pub.metas) || !loaded.solution.metaAnswers) return null;
  cache.set(id, loaded);
  return loaded;
}
