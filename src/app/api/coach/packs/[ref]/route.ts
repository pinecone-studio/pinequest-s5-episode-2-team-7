import { NextResponse } from "next/server";
import { Errors, requireUser, route } from "@/lib/api/http";
import { publicPack } from "@/lib/coach/types";
import { challengeAccess, resolvePack } from "@/lib/services/coach";
import { getVoiceFeatures } from "@/lib/speech/features";

type Ctx = { params: Promise<{ ref: string }> };

/**
 * What the practice page needs: the public part of the pack and which voice features work.
 * `?challenge=<id>`: the challenge's own time limit applies, and a member without attempts left is stopped here.
 */
export const GET = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { ref } = await params;
  const resolved = await resolvePack(auth.userId, ref);
  const teamId = resolved.teamId;
  // A copy: built-in packs are shared objects.
  const pack = { ...resolved.pack };
  const challengeId = new URL(request.url).searchParams.get("challenge");
  let attemptsLeft: number | null = null;
  if (challengeId) {
    const access = await challengeAccess(auth.userId, challengeId);
    if (access.attemptsLeft === 0) throw Errors.conflict("Энэ сорилтын оролдлого дууссан байна.");
    if (access.challenge.timeLimitSec) pack.maxSec = access.challenge.timeLimitSec;
    attemptsLeft = access.attemptsLeft;
  }
  return NextResponse.json({ pack: publicPack(pack, teamId), voice: getVoiceFeatures(pack.gender), attemptsLeft });
});
