import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Card } from "@/components/ui";
import { getPageSession } from "@/lib/auth/server";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Бүртгүүлэх" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const next = safeNext((await searchParams).next);
  if (await getPageSession()) redirect(next);
  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <Card className="p-6 sm:p-8">
        <h1 className="text-xl font-semibold">Бүртгүүлэх</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          Зөвхөн нэр, и-мэйл хадгална. Дадлагын дүгнэлт тань зөвхөн танд (багийн сорилт бол менежерт) харагдана.
        </p>
        <AuthForm mode="register" next={next} />
      </Card>
    </main>
  );
}
