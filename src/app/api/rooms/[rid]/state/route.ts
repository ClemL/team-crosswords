import type { NextRequest } from "next/server";
import { buildPlayerView } from "@/game/views";
import { ApiError, handle, json, notModified } from "@/server/http";
import { pollRoom } from "@/server/room-service";

export const dynamic = "force-dynamic";

function sinceParam(raw: string | null): number | null {
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/** GET /api/rooms/[rid]/state?pid=&since= → 304 or PlayerView */
export async function GET(req: NextRequest, { params }: { params: Promise<{ rid: string }> }) {
  return handle(async () => {
    const { rid } = await params;
    const pid = req.nextUrl.searchParams.get("pid");
    if (!pid) throw new ApiError("BAD_REQUEST", "pid is required.");
    const r = await pollRoom(rid, pid, sinceParam(req.nextUrl.searchParams.get("since")));
    if (r.notModified) return notModified();
    return json(buildPlayerView(r.state, r.ctx, pid, Date.now()));
  });
}
