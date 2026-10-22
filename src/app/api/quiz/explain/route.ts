import { NextResponse } from "next/server";
import { Errors, parseJson, requireUser, route } from "@/lib/api/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { ExplainInputSchema, explainTopic } from "@/lib/services/quiz";

export const maxDuration = 120;

/** Body: a weak topic from the grade → a short lesson with self-check questions. */
export const POST = route(async (request) => {
  const auth = await requireUser(request);
  const limit = checkRateLimit(`quiz:${auth.userId}`, 10);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const input = await parseJson(request, ExplainInputSchema);
  return NextResponse.json({ lesson: await explainTopic(input) });
});
