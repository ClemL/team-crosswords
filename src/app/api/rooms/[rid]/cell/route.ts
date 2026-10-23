import { applyEntry } from "@/game/entry";
import { handle, int, json, readBody, str } from "@/server/http";
import { mutateRoom } from "@/server/room-service";

/** POST /api/rooms/[rid]/cell { pid, board, r, c, letter } */
export async function POST(req: Request, { params }: { params: Promise<{ rid: string }> }) {
  return handle(async () => {
    const { rid } = await params;
    const body = await readBody(req);
    const pid = str(body, "pid", 64);
    const board = int(body, "board");
    const r = int(body, "r");
    const c = int(body, "c");
    const letter = str(body, "letter", 1);
    const res = await mutateRoom(rid, (s, ctx, now) =>
      applyEntry(s, ctx, pid, board, r, c, letter, now),
    );
    return json({ ok: true, version: res.state.version });
  });
}
