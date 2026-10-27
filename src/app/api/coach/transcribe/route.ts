import { NextResponse } from "next/server";
import { Errors, requireUser, route } from "@/lib/api/http";
import { transcribeTrainee } from "@/lib/coach/engine";
import { checkRateLimit } from "@/lib/rate-limit";
import { MAX_STT_BYTES } from "@/lib/speech/chimege";

/** Body: 16 kHz mono WAV (≤ 15 s). `?lang=en` for the English-speaking personas. */
export const POST = route(async (request) => {
  const auth = await requireUser(request);
  const limit = checkRateLimit(`coach-stt:${auth.userId}`, 40);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_STT_BYTES) throw Errors.badRequest("Бичлэг 15 секундээс урт байна.");
  const language = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "mn";
  const wav = new Uint8Array(await request.arrayBuffer());
  return NextResponse.json({ text: await transcribeTrainee(wav, language) });
});
