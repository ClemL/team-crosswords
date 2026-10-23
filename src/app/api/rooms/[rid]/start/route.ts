import { masterStart } from "@/game/lobby";
import { handle, json, readBody, str } from "@/server/http";
import { mutateRoom } from "@/server/room-service";

/** POST /api/rooms/[rid]/start { pid } — master override; starts the timer. */
export async function POST(req: Request, { params }: { params: Promise<{ rid: string }> }) {
  return handle(async () => {
    const { rid } = await params;
    const pid = str(await readBody(req), "pid", 64);
    const r = await mutateRoom(rid, (s, ctx, now) => masterStart(s, ctx, pid, now));
    return json({ started: true, version: r.state.version });
  });
}
