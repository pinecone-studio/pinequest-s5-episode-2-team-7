"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/fetcher";

const LABELS = { draft: "Ноорог", published: "Нийтлэгдсэн", archived: "Архив" } as const;
type Status = keyof typeof LABELS;

export function CaseStatusSelect({ caseId, status }: { caseId: string; status: Status }) {
  const router = useRouter();
  const [value, setValue] = useState<Status>(status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <label className="sr-only" htmlFor={`status-${caseId}`}>
        Төлөв
      </label>
      <select
        id={`status-${caseId}`}
        value={value}
        disabled={pending}
        onChange={async (e) => {
          const next = e.target.value as Status;
          if (next === "published" && !window.confirm("Кейсийг нийтэлж оюутанд харагдуулах уу?")) return;
          setPending(true);
          setError(null);
          try {
            await apiFetch(`/api/admin/cases/${caseId}`, { method: "PATCH", json: { status: next } });
            setValue(next);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Алдаа");
          } finally {
            setPending(false);
          }
        }}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
      >
        {(Object.keys(LABELS) as Status[]).map((s) => (
          <option key={s} value={s}>
            {LABELS[s]}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
