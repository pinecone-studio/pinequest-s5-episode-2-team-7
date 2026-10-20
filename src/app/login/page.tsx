import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Card } from "@/components/ui";
import { getPageSession } from "@/lib/auth/server";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Нэвтрэх" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next);
  if (await getPageSession()) redirect(next);
  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <Card className="p-6 sm:p-8">
        <h1 className="text-xl font-semibold">Нэвтрэх</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">Дадлагаа үргэлжлүүлэхийн тулд нэвтэрнэ үү.</p>
        <AuthForm mode="login" next={next} />
      </Card>
    </main>
  );
}
