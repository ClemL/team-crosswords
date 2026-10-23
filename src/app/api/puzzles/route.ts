import { handle, json } from "@/server/http";
import { listPuzzles } from "@/server/puzzles";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** GET /api/puzzles — [{ id, title }] */
export async function GET() {
  return handle(async () => json(await listPuzzles(getStore())));
}
