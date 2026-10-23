import type { NextRequest } from "next/server";
import { buildHostView } from "@/game/views";
import { handle, json, notModified } from "@/server/http";
import { pollRoom } from "@/server/room-service";

export const dynamic = "force-dynamic";

/** GET /api/rooms/[rid]/host?since= → 304 or HostView */
export async function GET(req: NextRequest, { params }: { params: Promise<{ rid: string }> }) {
  return handle(async () => {
    const { rid } = await params;
    const rawSince = req.nextUrl.searchParams.get("since");
    const since =
      rawSince !== null && rawSince !== "" && Number.isInteger(Number(rawSince))
        ? Number(rawSince)
        : null;
    const r = await pollRoom(rid, null, since);
    if (r.notModified) return notModified();
    const joinUrl = `${req.nextUrl.origin}/play/${r.state.rid}`;
    return json(buildHostView(r.state, r.ctx, Date.now(), joinUrl));
  });
}
