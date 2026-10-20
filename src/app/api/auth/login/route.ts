import { NextResponse } from "next/server";
import { clientKey } from "@/lib/api/client-key";
import { Errors, parseJson, route } from "@/lib/api/http";
import { SESSION_COOKIE, sealSession, sessionCookieOptions } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { authenticate, LoginInput } from "@/lib/services/users";

export const POST = route(async (request) => {
  const input = await parseJson(request, LoginInput);
  // Per account (guessing one password) and per client (trying many accounts).
  const limit = checkRateLimit(`login:${clientKey(request)}:${input.email}`, 10);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const ipLimit = checkRateLimit(`login-ip:${clientKey(request)}`, 30);
  if (!ipLimit.ok) throw Errors.rateLimited(ipLimit.retryAfterSeconds);
  const user = await authenticate(input);
  const response = NextResponse.json({ user });
  response.cookies.set(SESSION_COOKIE, await sealSession({ userId: user.id, role: user.role, name: user.name }), sessionCookieOptions());
  return response;
});
