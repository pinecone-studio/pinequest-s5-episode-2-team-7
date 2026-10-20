import { NextResponse } from "next/server";
import { route } from "@/lib/api/http";
import { SESSION_COOKIE } from "@/lib/auth/session";

export const POST = route(async () => {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
});
