import { requireUser, route } from "@/lib/api/http";
import { patientReplyAudio } from "@/lib/services/voice";

type Ctx = { params: Promise<{ id: string; messageId: string }> };

/** The patient's reply as speech (WAV), for the student who owns the session. */
export const GET = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id, messageId } = await params;
  const wav = await patientReplyAudio(auth, id, messageId);
  return new Response(wav, { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=3600" } });
});
