"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Алдаа гарлаа</h1>
      <p className="mt-2 text-sm text-slate-500">Хуудсыг ачаалах үед системийн алдаа гарлаа. Дахин оролдоно уу.</p>
      <Button className="mt-6" onClick={reset}>
        Дахин оролдох
      </Button>
    </main>
  );
}
