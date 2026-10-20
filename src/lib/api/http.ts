import "server-only";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readCookie, SESSION_COOKIE, unsealSession, type SessionData } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

/** Error with a safe, user-facing (Mongolian) message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const Errors = {
  unauthorized: () => new ApiError(401, "unauthorized", "Нэвтэрч орно уу."),
  forbidden: () => new ApiError(403, "forbidden", "Танд энэ үйлдлийг хийх эрх байхгүй."),
  notFound: (what = "Мэдээлэл") => new ApiError(404, "not_found", `${what} олдсонгүй.`),
  conflict: (message: string) => new ApiError(409, "conflict", message),
  rateLimited: (seconds: number) => new ApiError(429, "rate_limited", `Хэт олон хүсэлт илгээлээ. ${seconds} секундын дараа дахин оролдоно уу.`),
  badRequest: (message: string, details?: unknown) => new ApiError(400, "bad_request", message, details),
};

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/** Wrap a route handler with uniform JSON error handling. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status });
      }
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: {
              code: "validation_error",
              message: "Оруулсан мэдээлэл буруу байна.",
              details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            },
          },
          { status: 400 },
        );
      }
      // Log without request bodies (they may contain conversation content).
      console.error(`[api] ${request.method} ${new URL(request.url).pathname} failed:`, error instanceof Error ? error.message : error);
      return NextResponse.json({ error: { code: "internal_error", message: "Системийн алдаа гарлаа. Дахин оролдоно уу." } }, { status: 500 });
    }
  };
}

export async function parseJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw Errors.badRequest("JSON формат буруу байна.");
  }
  return schema.parse(body);
}

export async function getAuth(request: Request): Promise<SessionData | null> {
  return unsealSession(readCookie(request.headers.get("cookie"), SESSION_COOKIE));
}

/** Valid cookie whose user still exists (cookies outlive deleted users and database switches). */
async function requireUserRow(request: Request): Promise<{ auth: SessionData; role: string }> {
  const auth = await getAuth(request);
  if (!auth) throw Errors.unauthorized();
  const db = await getDb();
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, auth.userId));
  if (!row) throw Errors.unauthorized();
  return { auth, role: row.role };
}

export async function requireUser(request: Request): Promise<SessionData> {
  return (await requireUserRow(request)).auth;
}

/** Admin check re-reads the role from the database (cookies can be stale). */
export async function requireAdmin(request: Request): Promise<SessionData> {
  const { auth, role } = await requireUserRow(request);
  if (role !== "admin") throw Errors.forbidden();
  return auth;
}
