import { Errors, requireUser, route } from "@/lib/api/http";
import { patientReplyAudio } from "@/lib/services/voice";

type Ctx = { params: Promise<{ id: string; messageId: string }> };

/**
 * The patient's reply as speech (WAV), for the student who owns the session.
 * `?part=n` returns only the n-th sentence group; `X-Speech-Parts` gives the count.
 */
export const GET = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id, messageId } = await params;
  const raw = new URL(request.url).searchParams.get("part");
  const part = raw === null ? undefined : Number(raw);
  if (part !== undefined && !Number.isInteger(part)) throw Errors.badRequest("part буруу байна.");
  const { wav, parts } = await patientReplyAudio(auth, id, messageId, part);
  return new Response(wav, {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=3600", "X-Speech-Parts": String(parts) },
  });
});
