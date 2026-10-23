import { timingSafeEqual } from "node:crypto";
import { ApiError, handle, json } from "@/server/http";
import { seedPuzzles } from "@/server/puzzles";
import { getStore } from "@/server/store";

function secretMatches(given: string | null): boolean {
  const expected = process.env.ADMIN_SEED_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** POST /api/admin/seed — loads every puzzle file (5x and 6x) into puzzle:* keys. Idempotent. */
export async function POST(req: Request) {
  return handle(async () => {
    if (!secretMatches(req.headers.get("x-seed-secret"))) {
      throw new ApiError("UNAUTHORIZED", "Missing or wrong x-seed-secret header.");
    }
    const puzzles = await seedPuzzles(getStore());
    return json({ seeded: puzzles.length, puzzles });
  });
}
