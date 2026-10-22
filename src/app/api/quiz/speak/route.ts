import { Errors, parseJson, requireUser, route } from "@/lib/api/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { SpeakInputSchema, examinerSpeech } from "@/lib/services/quiz";

/** Body: `{ text }` (an examiner line: question, greeting) → WAV in the examiner's voice. */
export const POST = route(async (request) => {
  const auth = await requireUser(request);
  const limit = checkRateLimit(`tts:${auth.userId}`, 60);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const { text } = await parseJson(request, SpeakInputSchema);
  const wav = await examinerSpeech(text);
  return new Response(wav, { headers: { "content-type": "audio/wav", "cache-control": "no-store" } });
});
