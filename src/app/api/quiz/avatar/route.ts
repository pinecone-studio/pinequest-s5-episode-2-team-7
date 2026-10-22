import { NextResponse } from "next/server";
import { Errors, requireUser, route } from "@/lib/api/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { createExaminerAvatarToken } from "@/lib/speech/features";

/** Short-lived Anam token for the «Шүүлэг» examiner's face. */
export const POST = route(async (request) => {
  const auth = await requireUser(request);
  const limit = checkRateLimit(`avatar:${auth.userId}`, 5);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  return NextResponse.json({ sessionToken: await createExaminerAvatarToken(), provider: "anam" });
});
