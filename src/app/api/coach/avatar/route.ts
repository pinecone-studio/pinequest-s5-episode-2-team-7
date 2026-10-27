import { NextResponse } from "next/server";
import { z } from "zod";
import { Errors, parseJson, requireUser, route } from "@/lib/api/http";
import { COACH_EMOTIONS } from "@/lib/coach/types";
import { getConfig } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolvePack } from "@/lib/services/coach";
import { createAvatarToken } from "@/lib/speech/features";

const AvatarSchema = z.object({ packRef: z.string().min(1).max(64), emotion: z.enum(COACH_EMOTIONS).optional() });

/** Short-lived avatar token for the persona's face (video mode). */
export const POST = route(async (request) => {
  const auth = await requireUser(request);
  const limit = checkRateLimit(`coach-avatar:${auth.userId}`, 6);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const input = await parseJson(request, AvatarSchema);
  const { pack } = await resolvePack(auth.userId, input.packRef);
  const sessionToken = await createAvatarToken(pack.gender, input.emotion, request.signal, `coach-${pack.id}`);
  return NextResponse.json({ sessionToken, provider: getConfig().AVATAR_PROVIDER });
});
