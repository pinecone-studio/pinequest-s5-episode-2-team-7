import { NextResponse } from "next/server";
import { Errors, requireUser, route } from "@/lib/api/http";
import { getSessionView } from "@/lib/services/sessions";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id } = await params;
  const session = await getSessionView(auth, id);
  if (!session.evaluation) throw Errors.notFound("Үнэлгээ");
  return NextResponse.json({ evaluation: session.evaluation, submission: session.submission });
});
