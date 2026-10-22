"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/fetcher";
import { Button, Spinner } from "../ui";

interface ImportResult {
  created: number;
  skipped: number;
  failed: number;
  feeds: { name: string; ok: boolean; error?: string }[];
}

function describe(r: ImportResult): string {
  const parts = [`${r.created} шинэ ноорог`];
  if (r.skipped) parts.push(`${r.skipped} алгассан`);
  if (r.failed) parts.push(`${r.failed} орчуулга амжилтгүй`);
  const down = r.feeds.filter((f) => !f.ok).map((f) => f.name);
  if (down.length) parts.push(`холбогдоогүй: ${down.join(", ")}`);
  return parts.join(" · ");
}

/** Fetches RSS feeds now; imported articles arrive as drafts for review. */
export function NewsImportButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  return (
    <div className="flex flex-col items-end">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setMessage(null);
          try {
            const result = await apiFetch<ImportResult>("/api/admin/news/import", { method: "POST" });
            setMessage({ tone: "ok", text: describe(result) });
            router.refresh();
          } catch (err) {
            setMessage({ tone: "error", text: err instanceof Error ? err.message : "Алдаа гарлаа." });
          } finally {
            setPending(false);
          }
        }}
      >
        {pending && <Spinner />}
        {pending ? "Татаж, орчуулж байна…" : "RSS-ээс татах"}
      </Button>
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`mt-1 text-xs ${message.tone === "error" ? "text-rose-600" : "text-slate-500"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
