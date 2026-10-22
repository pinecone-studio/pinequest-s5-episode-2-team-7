import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/api/http";
import { isEmotionId } from "@/lib/patient/emotions";
import { startAvatar } from "@/lib/services/voice";

type Ctx = { params: Promise<{ id: string }> };

/** Short-lived avatar-service (Simli or Anam) token for this session's patient face. */
export const POST = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { emotion?: unknown };
  return NextResponse.json(await startAvatar(auth, id, isEmotionId(body.emotion) ? body.emotion : undefined));
});
