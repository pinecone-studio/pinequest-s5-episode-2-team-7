import { z } from "zod";
import { Errors, parseJson, requireUser, route } from "@/lib/api/http";
import { coachSpeech } from "@/lib/coach/engine";
import { COACH_EMOTIONS } from "@/lib/coach/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolvePack } from "@/lib/services/coach";

const SpeakSchema = z.object({
  packRef: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(800),
  emotion: z.enum(COACH_EMOTIONS).optional(),
});

/** One sentence of the persona → WAV in its voice. */
export const POST = route(async (request) => {
  const auth = await requireUser(request);
  const limit = checkRateLimit(`coach-tts:${auth.userId}`, 120);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const input = await parseJson(request, SpeakSchema);
  const { pack } = await resolvePack(auth.userId, input.packRef);
  const wav = await coachSpeech(pack, input.text, input.emotion);
  return new Response(wav, { headers: { "content-type": "audio/wav", "cache-control": "no-store" } });
});
