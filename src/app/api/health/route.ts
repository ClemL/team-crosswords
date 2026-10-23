import { json } from "@/server/http";
import { puzzleKeys } from "@/server/keys";
import { parseIndex } from "@/server/puzzles";
import { getStore, StoreError, storeKind } from "@/server/store";

export const dynamic = "force-dynamic";

const present = (name: string) => Boolean(process.env[name]?.trim());

/**
 * GET /api/health — deployment diagnostics. Reports which configuration variables are present
 * (never their values), which store is in use, whether the database answers, and whether the
 * puzzles are seeded.
 */
export async function GET() {
  const env = {
    UPSTASH_REDIS_REST_URL: present("UPSTASH_REDIS_REST_URL"),
    UPSTASH_REDIS_REST_TOKEN: present("UPSTASH_REDIS_REST_TOKEN"),
    KV_REST_API_URL: present("KV_REST_API_URL"),
    KV_REST_API_TOKEN: present("KV_REST_API_TOKEN"),
    ADMIN_SEED_SECRET: present("ADMIN_SEED_SECRET"),
  };
  let store = "unconfigured";
  let database = "ok";
  let puzzlesSeeded: number | null = null;
  let staleSeed = false;
  try {
    store = storeKind();
    const [index] = await getStore().exec([{ op: "get", key: puzzleKeys.index }]);
    const parsed = parseIndex(index);
    puzzlesSeeded = parsed?.puzzles.length ?? 0;
    staleSeed = parsed?.stale ?? false;
  } catch (e) {
    database = e instanceof StoreError ? e.publicMessage : "unexpected error (see server logs)";
    if (!(e instanceof StoreError)) console.error("[health]", e);
  }
  const ok = database === "ok" && (puzzlesSeeded ?? 0) > 0;
  const next =
    database !== "ok"
      ? database
      : staleSeed
        ? 'Puzzles were seeded by an older version: POST /api/admin/seed again with header "x-seed-secret".'
        : puzzlesSeeded === 0
          ? 'Database reachable but empty: POST /api/admin/seed with header "x-seed-secret".'
          : "Ready.";
  return json({ ok, store, database, puzzlesSeeded, env, next }, ok ? 200 : 503);
}
