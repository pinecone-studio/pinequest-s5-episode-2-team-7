import { NextResponse } from "next/server";
import { z } from "zod";
import { Errors, parseJson, requireUser, route } from "@/lib/api/http";
import { gradeConversation } from "@/lib/coach/engine";
import { COACH_DIFFICULTIES, COACH_MODES } from "@/lib/coach/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolvePack, saveResult } from "@/lib/services/coach";

const DebriefInputSchema = z.object({
  packRef: z.string().min(1).max(64),
  mode: z.enum(COACH_MODES).default("video"),
  difficulty: z.enum(COACH_DIFFICULTIES).default("medium"),
  history: z
    .array(z.object({ role: z.enum(["me", "ai"]), text: z.string().max(2_000), t: z.number().min(0).max(7_200) }))
    .min(1)
    .max(120),
  durationSec: z.number().int().min(0).max(7_200),
  challengeId: z.string().uuid().nullable().default(null),
});

/** Grade a finished conversation, save it (and count it for the challenge) and return the feedback. */
export const POST = route(async (request) => {
  const auth = await requireUser(request);
  const limit = checkRateLimit(`coach-debrief:${auth.userId}`, 6);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const input = await parseJson(request, DebriefInputSchema);
  if (!input.history.some((h) => h.role === "me" && h.text !== "(чимээгүй)")) throw Errors.badRequest("Та юу ч хэлээгүй тул дүгнэх зүйл алга.");
  const { pack } = await resolvePack(auth.userId, input.packRef);
  const debrief = await gradeConversation(pack, input);
  const saved = await saveResult(auth.userId, {
    pack,
    mode: input.mode,
    difficulty: input.difficulty,
    debrief,
    transcript: input.history,
    durationSec: input.durationSec,
    challengeId: input.challengeId,
  });
  return NextResponse.json({ id: saved.id, debrief, challenge: saved.challenge });
});
