import "server-only";
import bcrypt from "bcryptjs";
import { sealData, unsealData } from "iron-session";
import { getConfig } from "@/lib/config";

/**
 * Encrypted, HTTP-only cookie session (iron-session seal). Works from both
 * Route Handlers (via the Cookie header) and Server Components (via
 * next/headers cookies()).
 */
export const SESSION_COOKIE = "pq_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type Role = "student" | "admin";

export interface SessionData {
  userId: string;
  role: Role;
  name: string;
  issuedAt: number;
}

export async function sealSession(data: Omit<SessionData, "issuedAt">): Promise<string> {
  return sealData({ ...data, issuedAt: Date.now() } satisfies SessionData, {
    password: getConfig().sessionSecret,
    ttl: SESSION_TTL_SECONDS,
  });
}

export async function unsealSession(sealed: string | undefined | null): Promise<SessionData | null> {
  if (!sealed) return null;
  try {
    const data = await unsealData<Partial<SessionData>>(sealed, { password: getConfig().sessionSecret, ttl: SESSION_TTL_SECONDS });
    if (!data.userId || (data.role !== "student" && data.role !== "admin")) return null;
    return data as SessionData;
  } catch {
    return null;
  }
}

export function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: getConfig().NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
