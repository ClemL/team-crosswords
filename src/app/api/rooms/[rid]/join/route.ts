import { randomUUID } from "node:crypto";
import { joinRoom } from "@/game/lobby";
import { ApiError, handle, json, readBody } from "@/server/http";
import { mutateRoom } from "@/server/room-service";

const PID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** POST /api/rooms/[rid]/join { name, playerId } → { playerId, seat } */
export async function POST(req: Request, { params }: { params: Promise<{ rid: string }> }) {
  return handle(async () => {
    const { rid } = await params;
    const body = await readBody(req);
    const given = body.playerId;
    if (
      given !== null &&
      given !== undefined &&
      (typeof given !== "string" || !PID_PATTERN.test(given))
    ) {
      throw new ApiError("BAD_REQUEST", "Invalid playerId.");
    }
    const pid = typeof given === "string" ? given : randomUUID();
    const r = await mutateRoom(rid, (s, ctx, now) => joinRoom(s, ctx, pid, body.name, now));
    return json({ playerId: pid, seat: r.seat, version: r.state.version });
  });
}
