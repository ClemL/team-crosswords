import { toggleSuspect } from "@/game/suspect";
import { bool, handle, int, json, readBody, str } from "@/server/http";
import { mutateRoom } from "@/server/room-service";

/** POST /api/rooms/[rid]/suspect { pid, board, r, c, on } */
export async function POST(req: Request, { params }: { params: Promise<{ rid: string }> }) {
  return handle(async () => {
    const { rid } = await params;
    const body = await readBody(req);
    const pid = str(body, "pid", 64);
    const board = int(body, "board");
    const r = int(body, "r");
    const c = int(body, "c");
    const on = bool(body, "on");
    const res = await mutateRoom(rid, (s, ctx, now) =>
      toggleSuspect(s, ctx, pid, board, r, c, on, now),
    );
    return json({ ok: true, version: res.state.version });
  });
}
