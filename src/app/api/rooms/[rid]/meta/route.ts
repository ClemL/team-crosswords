import { guessMeta } from "@/game/meta";
import { handle, json, readBody, str } from "@/server/http";
import { mutateRoom } from "@/server/room-service";

/**
 * POST /api/rooms/[rid]/meta { pid, guess } → { correct, metaId, points }
 * Each player's single guess is checked against every meta word not yet obtained; `metaId` and
 * `points` are null on a miss. Either way the player's guess is used up.
 */
export async function POST(req: Request, { params }: { params: Promise<{ rid: string }> }) {
  return handle(async () => {
    const { rid } = await params;
    const body = await readBody(req);
    const pid = str(body, "pid", 64);
    const guess = str(body, "guess", 64);
    const res = await mutateRoom(rid, (s, ctx, now) => guessMeta(s, ctx, pid, guess, now));
    return json({
      correct: res.correct,
      metaId: res.metaId,
      points: res.points,
      version: res.state.version,
    });
  });
}
