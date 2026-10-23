import { finalCheck } from "@/game/rotation";
import { handle, json, readBody, str } from "@/server/http";
import { mutateRoom } from "@/server/room-service";

/** POST /api/rooms/[rid]/final-check { pid } — master only; all cells filled; respects cooldown. */
export async function POST(req: Request, { params }: { params: Promise<{ rid: string }> }) {
  return handle(async () => {
    const { rid } = await params;
    const pid = str(await readBody(req), "pid", 64);
    const res = await mutateRoom(rid, (s, ctx, now) => finalCheck(s, ctx, pid, now));
    return json({ status: res.state.status, version: res.state.version });
  });
}
