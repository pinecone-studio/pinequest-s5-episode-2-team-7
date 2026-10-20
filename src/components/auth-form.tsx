"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, ClientApiError } from "@/lib/fetcher";
import { Alert, Button, Input, Label, Spinner } from "./ui";

export function AuthForm({ mode, next }: { mode: "login" | "register"; next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      await apiFetch(`/api/auth/${mode}`, { method: "POST", json: body });
      router.push(next);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError && Array.isArray(err.details)) {
        const map: Record<string, string> = {};
        for (const d of err.details as { path: string; message: string }[]) map[d.path] = d.message;
        setFieldErrors(map);
      }
      setError(err instanceof Error ? err.message : "Алдаа гарлаа.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <Alert>{error}</Alert>}
      {mode === "register" && (
        <div>
          <Label htmlFor="name">Нэр</Label>
          <Input id="name" name="name" autoComplete="name" required minLength={2} aria-invalid={Boolean(fieldErrors.name)} />
          {fieldErrors.name && <p className="mt-1 text-xs text-rose-600">{fieldErrors.name}</p>}
        </div>
      )}
      <div>
        <Label htmlFor="email">И-мэйл</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(fieldErrors.email)} />
        {fieldErrors.email && <p className="mt-1 text-xs text-rose-600">{fieldErrors.email}</p>}
      </div>
      <div>
        <Label htmlFor="password" hint={mode === "register" ? "(8-аас доошгүй тэмдэгт)" : undefined}>
          Нууц үг
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={mode === "register" ? 8 : 1}
          aria-invalid={Boolean(fieldErrors.password)}
        />
        {fieldErrors.password && <p className="mt-1 text-xs text-rose-600">{fieldErrors.password}</p>}
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending && <Spinner />}
        {mode === "login" ? "Нэвтрэх" : "Бүртгүүлэх"}
      </Button>
      <p className="text-center text-sm text-slate-500">
        {mode === "login" ? (
          <>
            Бүртгэлгүй юу?{" "}
            <Link className="font-medium text-brand-700 hover:underline" href={`/register?next=${encodeURIComponent(next)}`}>
              Бүртгүүлэх
            </Link>
          </>
        ) : (
          <>
            Бүртгэлтэй юу?{" "}
            <Link className="font-medium text-brand-700 hover:underline" href={`/login?next=${encodeURIComponent(next)}`}>
              Нэвтрэх
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
