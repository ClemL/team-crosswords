import { checkCells } from "@/game/check";
import { handle, int, json, readBody, str } from "@/server/http";
import { mutateRoom } from "@/server/room-service";

/** POST /api/rooms/[rid]/check { pid, board, clueId } → { wrong, locked, tokensLeft } */
export async function POST(req: Request, { params }: { params: Promise<{ rid: string }> }) {
  return handle(async () => {
    const { rid } = await params;
    const body = await readBody(req);
    const pid = str(body, "pid", 64);
    const board = int(body, "board");
    const clueId = str(body, "clueId", 32);
    const res = await mutateRoom(rid, (s, ctx, now) => checkCells(s, ctx, pid, board, clueId, now));
    return json({
      wrong: res.wrong,
      locked: res.locked,
      tokensLeft: res.state.tokensLeft,
      version: res.state.version,
    });
  });
}
