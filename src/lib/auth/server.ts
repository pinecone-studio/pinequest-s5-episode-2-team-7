import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUser, type PublicUser } from "@/lib/services/users";
import { SESSION_COOKIE, unsealSession, type SessionData } from "./session";

/** Session for Server Components (null when signed out). */
export async function getPageSession(): Promise<SessionData | null> {
  const store = await cookies();
  return unsealSession(store.get(SESSION_COOKIE)?.value);
}

export async function requirePageUser(next: string): Promise<SessionData> {
  const session = await getPageSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  return session;
}

/** Admin pages re-check the role in the database. */
export async function requirePageAdmin(next: string): Promise<{ session: SessionData; user: PublicUser }> {
  const session = await requirePageUser(next);
  const user = await getUser(session.userId);
  if (!user || user.role !== "admin") redirect("/dashboard?denied=1");
  return { session: { ...session, role: "admin" }, user };
}
