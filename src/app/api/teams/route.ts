import { NextResponse } from "next/server";
import { Errors, parseJson, requireUser, route } from "@/lib/api/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { CreateTeamSchema, createTeam, teamsOverview } from "@/lib/services/coach";

/** The user's teams: members, challenges and results (owners see everyone's). */
export const GET = route(async (request) => {
  const auth = await requireUser(request);
  return NextResponse.json(await teamsOverview(auth.userId));
});

/** Body: `{ name }` → a new team owned by the user, with a join code for staff. */
export const POST = route(async (request) => {
  const auth = await requireUser(request);
  const limit = checkRateLimit(`team-create:${auth.userId}`, 5);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const { name } = await parseJson(request, CreateTeamSchema);
  return NextResponse.json({ team: await createTeam(auth.userId, name) });
});
