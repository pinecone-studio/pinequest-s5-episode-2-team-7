/**
 * Seed demo cases (published) and the first administrator.
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD   (required for the admin)
 *   SEED_STUDENT_EMAIL / SEED_STUDENT_PASSWORD (optional demo student)
 * Safe to run repeatedly.
 */
import "./load-env";
import { eq } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth/session";
import { getDb } from "../src/lib/db/client";
import { users } from "../src/lib/db/schema";
import { seedDemoCases } from "../src/lib/services/cases";

async function ensureUser(email: string | undefined, password: string | undefined, role: "admin" | "student", name: string) {
  if (!email || !password) return `skipped ${role} (set SEED_${role.toUpperCase()}_EMAIL and SEED_${role.toUpperCase()}_PASSWORD)`;
  if (password.length < 8) throw new Error(`SEED_${role.toUpperCase()}_PASSWORD must be at least 8 characters`);
  const db = await getDb();
  const normalized = email.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) {
    if (existing.role !== role) await db.update(users).set({ role }).where(eq(users.id, existing.id));
    return `${role} ${normalized} already exists`;
  }
  await db.insert(users).values({ email: normalized, name, role, passwordHash: await hashPassword(password) });
  return `created ${role} ${normalized}`;
}

async function main() {
  const inserted = await seedDemoCases();
  console.log(inserted.length ? `✓ demo cases inserted: ${inserted.join(", ")}` : "✓ demo cases already present");
  console.log("✓", await ensureUser(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD, "admin", "Админ"));
  console.log("✓", await ensureUser(process.env.SEED_STUDENT_EMAIL, process.env.SEED_STUDENT_PASSWORD, "student", "Демо оюутан"));
  process.exit(0);
}

main().catch((error) => {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
