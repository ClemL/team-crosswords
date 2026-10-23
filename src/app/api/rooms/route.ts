import { handle, json, readBody, str } from "@/server/http";
import { createRoomForPuzzle } from "@/server/room-service";

/** POST /api/rooms { puzzleId } → { rid } */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readBody(req);
    const rid = await createRoomForPuzzle(str(body, "puzzleId", 64));
    return json({ rid }, 201);
  });
}
