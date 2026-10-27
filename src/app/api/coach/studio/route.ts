import { NextResponse } from "next/server";
import { Errors, parseJson, requireUser, route } from "@/lib/api/http";
import { StudioInputSchema, buildStudioPack } from "@/lib/coach/studio";
import { checkRateLimit } from "@/lib/rate-limit";
import { savePack } from "@/lib/services/coach";

/**
 * «Аватар студи»: a manager builds a persona by hand (role, mood, questions to ask,
 * company knowledge, weighted criteria, time limit). Saved at once — no AI call.
 */
export const POST = route(async (request) => {
  const auth = await requireUser(request);
  const limit = checkRateLimit(`coach-studio:${auth.userId}`, 20);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const input = await parseJson(request, StudioInputSchema);
  return NextResponse.json({ pack: await savePack(auth.userId, buildStudioPack(input), input.teamId) });
});
