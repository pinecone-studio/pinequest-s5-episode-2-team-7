import { NextResponse } from "next/server";
import { z } from "zod";
import { Errors, parseJson, requireUser, route } from "@/lib/api/http";
import { CreateChallengeSchema, createChallenge } from "@/lib/services/coach";

type Ctx = { params: Promise<{ id: string }> };

/** Team owner gives the staff a challenge: a persona, a target score and an optional deadline. */
export const POST = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) throw Errors.notFound("Баг");
  const input = await parseJson(request, CreateChallengeSchema);
  const challenge = await createChallenge(auth.userId, id, input);
  return NextResponse.json({ challenge: { id: challenge.id, title: challenge.title } });
});
