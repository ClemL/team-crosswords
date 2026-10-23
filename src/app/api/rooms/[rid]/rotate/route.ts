import { requestRotation } from "@/game/rotation";
import { ApiError, handle, json, readBody, str } from "@/server/http";
import { mutateRoom } from "@/server/room-service";

/** POST /api/rooms/[rid]/rotate { pid, dir: "L" | "R" } — master only, after cooldown. */
export async function POST(req: Request, { params }: { params: Promise<{ rid: string }> }) {
  return handle(async () => {
    const { rid } = await params;
    const body = await readBody(req);
    const pid = str(body, "pid", 64);
    const dir = str(body, "dir", 1);
    if (dir !== "L" && dir !== "R") throw new ApiError("BAD_REQUEST", 'dir must be "L" or "R".');
    const res = await mutateRoom(rid, (s, ctx, now) => requestRotation(s, ctx, pid, dir, now));
    return json({ pending: res.state.pendingRotation, version: res.state.version });
  });
}
