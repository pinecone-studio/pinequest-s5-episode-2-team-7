import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/api/http";
import { generateDebrief } from "@/lib/services/debrief";

type Ctx = { params: Promise<{ id: string }> };

/** «Шүүлэгч» for a finished session (never fails for model reasons: falls back to the rubric). */
export const POST = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id } = await params;
  return NextResponse.json({ debrief: await generateDebrief(auth, id) });
});
