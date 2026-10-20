import { NextResponse } from "next/server";
import { clientKey } from "@/lib/api/client-key";
import { Errors, parseJson, route } from "@/lib/api/http";
import { SESSION_COOKIE, sealSession, sessionCookieOptions } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { RegisterInput, registerUser } from "@/lib/services/users";

/** Self-registration always creates a STUDENT account. */
export const POST = route(async (request) => {
  const limit = checkRateLimit(`register:${clientKey(request)}`, 5);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const input = await parseJson(request, RegisterInput);
  const user = await registerUser(input, "student");
  const response = NextResponse.json({ user }, { status: 201 });
  response.cookies.set(SESSION_COOKIE, await sealSession({ userId: user.id, role: user.role, name: user.name }), sessionCookieOptions());
  return response;
});
