import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireUser, route } from "@/lib/api/http";
import { listSessions, startSession } from "@/lib/services/sessions";

export const GET = route(async (request) => {
  const auth = await requireUser(request);
  return NextResponse.json({ sessions: await listSessions(auth) });
});

export const POST = route(async (request) => {
  const auth = await requireUser(request);
  const { caseId } = await parseJson(request, z.object({ caseId: z.string().min(1).max(80) }));
  return NextResponse.json(await startSession(auth, caseId), { status: 201 });
});
