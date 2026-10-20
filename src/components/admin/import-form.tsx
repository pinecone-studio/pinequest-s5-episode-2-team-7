"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Spinner, Textarea } from "../ui";

interface ImportReport {
  created: string[];
  updated: string[];
  failed: { index: number; id?: string; issues: { path: string; message: string }[] }[];
}

export function ImportForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    setReport(null);
    try {
      const response = await fetch("/api/admin/cases/import", { method: "POST", headers: { "content-type": "application/json" }, body: text });
      const data = await response.json();
      if (data.report) setReport(data.report);
      else setError(data.error?.message ?? "Импорт амжилтгүй.");
      router.refresh();
    } catch {
      setError("Сервертэй холбогдож чадсангүй.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="import-file" className="mb-1.5 block text-sm font-medium text-slate-700">
          JSON файл сонгох
        </label>
        <input
          id="import-file"
          type="file"
          accept="application/json,.json"
          className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) setText(await file.text());
          }}
        />
      </div>
      <Textarea
        aria-label="Импортлох JSON"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        spellCheck={false}
        placeholder='Нэг кейс, кейсийн массив эсвэл { "cases": [...] } хэлбэрээр'
        className="font-mono text-xs"
      />
      <Button onClick={submit} disabled={pending || !text.trim()}>
        {pending && <Spinner />}
        Шалгаж импортлох
      </Button>
      {error && <Alert>{error}</Alert>}
      {report && (
        <div className="space-y-2">
          {(report.created.length > 0 || report.updated.length > 0) && (
            <Alert tone="emerald" title="Амжилттай">
              Шинээр: {report.created.join(", ") || "—"} · Шинэчилсэн: {report.updated.join(", ") || "—"}. Шинэ кейс ноорог төлөвтэй байна.
            </Alert>
          )}
          {report.failed.map((f) => (
            <Alert key={f.index} title={`#${f.index + 1}${f.id ? ` (${f.id})` : ""} — алдаатай`}>
              <ul className="mt-1 space-y-0.5 text-xs">
                {f.issues.map((i, idx) => (
                  <li key={idx}>
                    <code>{i.path}</code>: {i.message}
                  </li>
                ))}
              </ul>
            </Alert>
          ))}
        </div>
      )}
    </div>
  );
}
