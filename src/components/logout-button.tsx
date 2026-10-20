"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
        router.push("/");
        router.refresh();
      }}
      className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-ink disabled:opacity-50"
    >
      Гарах
    </button>
  );
}
