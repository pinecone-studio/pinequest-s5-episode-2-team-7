import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { Errors } from "@/lib/api/http";
import { hashPassword, verifyPassword, type Role } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export const RegisterInput = z.object({
  name: z.string().trim().min(2, "Нэр хамгийн багадаа 2 тэмдэгт").max(80),
  email: z.string().trim().toLowerCase().email("И-мэйл хаяг буруу байна"),
  password: z.string().min(8, "Нууц үг хамгийн багадаа 8 тэмдэгт").max(200),
});

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email("И-мэйл хаяг буруу байна"),
  password: z.string().min(1, "Нууц үгээ оруулна уу").max(200),
});

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export async function registerUser(input: z.infer<typeof RegisterInput>, role: Role = "student"): Promise<PublicUser> {
  const db = await getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
  if (existing) throw Errors.conflict("Энэ и-мэйлээр бүртгэл үүссэн байна.");
  const [row] = await db
    .insert(users)
    .values({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password), role })
    .returning();
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export async function authenticate(input: z.infer<typeof LoginInput>): Promise<PublicUser> {
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.email, input.email));
  // Same error for unknown e-mail and wrong password.
  if (!row || !(await verifyPassword(input.password, row.passwordHash))) {
    throw Errors.badRequest("И-мэйл эсвэл нууц үг буруу байна.");
  }
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export async function getUser(id: string): Promise<PublicUser | null> {
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row ? { id: row.id, name: row.name, email: row.email, role: row.role } : null;
}
