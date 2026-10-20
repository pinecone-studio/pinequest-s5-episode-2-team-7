import { Errors, requireUser, route } from "@/lib/api/http";
import { fillerAudio, FILLERS } from "@/lib/services/voice";

type Ctx = { params: Promise<{ id: string }> };

/** A short hesitation sound ("Ммм...") in this patient's voice; `?i=` picks which one. */
export const GET = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id } = await params;
  const index = Number(new URL(request.url).searchParams.get("i") ?? 0);
  if (!Number.isInteger(index) || index < 0 || index >= FILLERS.length) throw Errors.badRequest("i буруу байна.");
  return new Response(await fillerAudio(auth, id, index), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" } });
});
