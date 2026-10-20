import { NextResponse } from "next/server";
import { requireAdmin, route } from "@/lib/api/http";
import { listSessions } from "@/lib/services/sessions";

export const GET = route(async (request) => {
  const auth = await requireAdmin(request);
  return NextResponse.json({ sessions: await listSessions(auth, { all: true, limit: 200 }) });
});
