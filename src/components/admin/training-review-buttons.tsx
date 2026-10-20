"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/fetcher";
import { Button, Spinner } from "../ui";

export function TrainingReviewButtons({ sessionId }: { sessionId: string }) {
  const [pending, setPending] = useState<"approved" | "rejected" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function review(status: "approved" | "rejected") {
    setPending(status);
    setMessage(null);
    try {
      const { example } = await apiFetch<{ example: { turns: number; status: string } }>(`/api/admin/sessions/${sessionId}/training`, {
        method: "POST",
        json: { status },
      });
      setMessage({ ok: true, text: status === "approved" ? `Зөвшөөрлөө (${example.turns} асуулт-хариулт).` : "Татгалзлаа." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Алдаа гарлаа." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => review("approved")} disabled={pending !== null}>
        {pending === "approved" && <Spinner />}
        Сургалтад зөвшөөрөх
      </Button>
      <Button size="sm" variant="secondary" onClick={() => review("rejected")} disabled={pending !== null}>
        {pending === "rejected" && <Spinner />}
        Татгалзах
      </Button>
      {message && (
        <span role="status" className={message.ok ? "text-xs text-emerald-700" : "text-xs text-rose-700"}>
          {message.text}
        </span>
      )}
    </div>
  );
}
