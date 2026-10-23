import { markReady } from "@/game/lobby";
import { handle, json, readBody, str } from "@/server/http";
import { mutateRoom } from "@/server/room-service";

/** POST /api/rooms/[rid]/ready { pid } — starts the timer when all active players are ready. */
export async function POST(req: Request, { params }: { params: Promise<{ rid: string }> }) {
  return handle(async () => {
    const { rid } = await params;
    const pid = str(await readBody(req), "pid", 64);
    const r = await mutateRoom(rid, (s, ctx, now) => markReady(s, ctx, pid, now));
    return json({ started: r.started, version: r.state.version });
  });
}
