import { restartRoom } from "@/game/lobby";
import { handle, json, readBody, str } from "@/server/http";
import { mutateRoom } from "@/server/room-service";

/**
 * POST /api/rooms/[rid]/restart { pid } — ends the round and puts the same puzzle back in the
 * lobby with the same players. Capt. only while a game is on; anyone once it has ended.
 */
export async function POST(req: Request, { params }: { params: Promise<{ rid: string }> }) {
  return handle(async () => {
    const { rid } = await params;
    const pid = str(await readBody(req), "pid", 64);
    const r = await mutateRoom(rid, (s, ctx, now) => restartRoom(s, ctx, pid, now));
    return json({ restarted: true, version: r.state.version });
  });
}
