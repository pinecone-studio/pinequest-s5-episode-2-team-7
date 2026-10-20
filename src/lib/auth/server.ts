import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUser, type PublicUser } from "@/lib/services/users";
import { SESSION_COOKIE, unsealSession, type SessionData } from "./session";

/**
 * Session and its user for Server Components (null when signed out). A cookie
 * whose user no longer exists (deleted, or the database was switched) counts
 * as signed out.
 */
async function getPageSessionUser(): Promise<{ session: SessionData; user: PublicUser } | null> {
  const store = await cookies();
  const session = await unsealSession(store.get(SESSION_COOKIE)?.value);
  const user = session ? await getUser(session.userId) : null;
  return session && user ? { session, user } : null;
}

export async function getPageSession(): Promise<SessionData | null> {
  return (await getPageSessionUser())?.session ?? null;
}

export async function requirePageUser(next: string): Promise<SessionData> {
  const current = await getPageSessionUser();
  if (!current) redirect(`/login?next=${encodeURIComponent(next)}`);
  return current.session;
}

/** Admin pages re-check the role in the database. */
export async function requirePageAdmin(next: string): Promise<{ session: SessionData; user: PublicUser }> {
  const current = await getPageSessionUser();
  if (!current) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (current.user.role !== "admin") redirect("/dashboard?denied=1");
  return { session: { ...current.session, role: "admin" }, user: current.user };
}
