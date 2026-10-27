"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_COOKIE, parseRole } from "@/lib/role";
import { safeNext } from "@/lib/safe-next";

/** «Та юунд бэлдэж байна вэ?» form: saves the role for a year, then goes on to `next`. */
export async function chooseRole(formData: FormData) {
  const role = parseRole(String(formData.get("role") ?? ""));
  const next = safeNext(String(formData.get("next") ?? ""), "/");
  if (role) {
    (await cookies()).set(ROLE_COOKIE, role, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  redirect(next);
}
