import { guessMeta } from "@/game/meta";
import { handle, json, readBody, str } from "@/server/http";
import { mutateRoom } from "@/server/room-service";

/**
 * POST /api/rooms/[rid]/meta { pid, guess } → { correct, metaId, points, knockedOut }
 * A guess is checked against every meta word not yet obtained; `metaId` and `points` are null on a
 * miss. Alone, a player keeps guessing until a miss; with others, each player gets one guess and
 * a miss knocks them out (`knockedOut`).
 */
export async function POST(req: Request, { params }: { params: Promise<{ rid: string }> }) {
  return handle(async () => {
    const { rid } = await params;
    const body = await readBody(req);
    const pid = str(body, "pid", 64);
    const guess = str(body, "guess", 64);
    const res = await mutateRoom(rid, (s, ctx, now) =>
      guessMeta(s, ctx, pid, guess, now, Math.random),
    );
    return json({
      correct: res.correct,
      metaId: res.metaId,
      points: res.points,
      knockedOut: res.knockedOut,
      version: res.state.version,
    });
  });
}
