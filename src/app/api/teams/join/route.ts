import { NextResponse } from "next/server";
import { Errors, parseJson, requireUser, route } from "@/lib/api/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { JoinTeamSchema, joinTeam } from "@/lib/services/coach";

/** Body: `{ code }` → joins the employer's team. */
export const POST = route(async (request) => {
  const auth = await requireUser(request);
  const limit = checkRateLimit(`team-join:${auth.userId}`, 10);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const { code } = await parseJson(request, JoinTeamSchema);
  return NextResponse.json({ team: await joinTeam(auth.userId, code) });
});
