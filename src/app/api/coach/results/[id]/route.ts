import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/api/http";
import { resultDetail } from "@/lib/services/coach";

type Ctx = { params: Promise<{ id: string }> };

/** Full feedback and transcript: for the person who practised, or their team's owner. */
export const GET = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id } = await params;
  return NextResponse.json({ result: await resultDetail(auth.userId, id) });
});
