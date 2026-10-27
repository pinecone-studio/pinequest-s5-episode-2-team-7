import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/api/http";
import { publicPack } from "@/lib/coach/types";
import { resolvePack } from "@/lib/services/coach";
import { getVoiceFeatures } from "@/lib/speech/features";

type Ctx = { params: Promise<{ ref: string }> };

/** What the practice page needs: the public part of the pack and which voice features work. */
export const GET = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { ref } = await params;
  const { pack, teamId } = await resolvePack(auth.userId, ref);
  return NextResponse.json({ pack: publicPack(pack, teamId), voice: getVoiceFeatures(pack.gender) });
});
