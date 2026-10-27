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
      className="rounded-full px-3 py-1.5 text-muted hover:bg-field hover:text-ink disabled:opacity-50"
    >
      Гарах
    </button>
  );
}
