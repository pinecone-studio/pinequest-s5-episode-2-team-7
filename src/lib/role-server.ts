import "server-only";
import { cookies } from "next/headers";
import { ROLE_COOKIE, parseRole, type UserRole } from "./role";

/** The saved role, or null before onboarding. */
export async function getRole(): Promise<UserRole | null> {
  return parseRole((await cookies()).get(ROLE_COOKIE)?.value);
}
