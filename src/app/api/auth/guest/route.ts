import { NextResponse } from "next/server";
import { clientKey } from "@/lib/api/client-key";
import { Errors, getAuth, route } from "@/lib/api/http";
import { SESSION_COOKIE, sealSession, sessionCookieOptions } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { createGuestUser, getUser } from "@/lib/services/users";

/**
 * Practice without an account: keeps a valid existing session, otherwise
 * creates a guest student and signs it in. Every session API then works as usual.
 */
export const POST = route(async (request) => {
  const auth = await getAuth(request);
  const existing = auth ? await getUser(auth.userId) : null;
  if (existing) return NextResponse.json({ user: existing, guest: false });

  // Generous: a whole classroom or judging room may share one IP.
  const limit = checkRateLimit(`guest:${clientKey(request)}`, 30);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const user = await createGuestUser();
  const response = NextResponse.json({ user, guest: true }, { status: 201 });
  response.cookies.set(SESSION_COOKIE, await sealSession({ userId: user.id, role: user.role, name: user.name }), sessionCookieOptions());
  return response;
});
