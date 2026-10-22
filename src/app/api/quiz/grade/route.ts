import { NextResponse } from "next/server";
import { Errors, parseJson, requireUser, route } from "@/lib/api/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { GradeInputSchema, gradeQuiz } from "@/lib/services/quiz";

export const maxDuration = 120;

/** Body: the questions (with keys) and the student's answers → examiner feedback. */
export const POST = route(async (request) => {
  const auth = await requireUser(request);
  const limit = checkRateLimit(`quiz:${auth.userId}`, 10);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const input = await parseJson(request, GradeInputSchema);
  return NextResponse.json({ grade: await gradeQuiz(input) });
});
