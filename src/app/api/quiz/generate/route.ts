import { NextResponse } from "next/server";
import { Errors, parseJson, requireUser, route } from "@/lib/api/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { GenerateInputSchema, MAX_QUIZ_BYTES, generateQuiz } from "@/lib/services/quiz";

export const maxDuration = 120;

/** Body: study material (base64 photos / PDF / text + notes) → exam questions with answer keys. */
export const POST = route(async (request) => {
  const auth = await requireUser(request);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_QUIZ_BYTES) throw Errors.badRequest("Файлууд хэт том байна (25 MB хүртэл).");
  const limit = checkRateLimit(`quiz:${auth.userId}`, 10);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const input = await parseJson(request, GenerateInputSchema);
  return NextResponse.json({ quiz: await generateQuiz(input) });
});
