"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PublicCase } from "@/lib/cases/public";
import { apiFetch, ClientApiError } from "@/lib/fetcher";
import { DIFFICULTY_LABELS, SEX_LABELS } from "@/lib/i18n";
import { Alert, Badge, Button, Card, Spinner } from "../ui";

interface Issue {
  path: string;
  message: string;
}
interface QualityIssue {
  severity: "error" | "warning" | "info";
  message: string;
}
type ValidateResponse = { ok: true; preview: PublicCase; quality: QualityIssue[] } | { ok: false; issues: Issue[] };

export function CaseEditor({ mode, caseId, initialJson }: { mode: "create" | "edit"; caseId?: string; initialJson: string }) {
  const router = useRouter();
  const [text, setText] = useState(initialJson);
  const [result, setResult] = useState<ValidateResponse | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<"validate" | "save" | null>(null);

  function parse(): unknown | undefined {
    try {
      setParseError(null);
      return JSON.parse(text);
    } catch (error) {
      setParseError(`JSON алдаа: ${(error as Error).message}`);
      return undefined;
    }
  }

  async function validate() {
    const json = parse();
    if (json === undefined) return;
    setPending("validate");
    setSaveMessage(null);
    try {
      setResult(await apiFetch<ValidateResponse>("/api/admin/cases/validate", { method: "POST", json: { case: json } }));
    } catch (error) {
      setSaveMessage({ ok: false, text: error instanceof Error ? error.message : "Алдаа" });
    } finally {
      setPending(null);
    }
  }

  async function save() {
    const json = parse();
    if (json === undefined) return;
    setPending("save");
    setSaveMessage(null);
    try {
      if (mode === "create") {
        const { case: created } = await apiFetch<{ case: { id: string } }>("/api/admin/cases", { method: "POST", json: { case: json } });
        router.push(`/admin/cases/${created.id}`);
        router.refresh();
        return;
      }
      const { case: updated } = await apiFetch<{ case: { version: number } }>(`/api/admin/cases/${caseId}`, { method: "PUT", json: { case: json } });
      setSaveMessage({ ok: true, text: `Хадгаллаа. Шинэ хувилбар: v${updated.version}. Эхэлсэн ярилцлагууд хуучин хувилбараа ашиглана.` });
      router.refresh();
    } catch (error) {
      if (error instanceof ClientApiError && Array.isArray(error.details)) {
        setResult({ ok: false, issues: error.details as Issue[] });
      }
      setSaveMessage({ ok: false, text: error instanceof Error ? error.message : "Алдаа" });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <label htmlFor="case-json" className="mb-2 block text-sm font-medium text-slate-700">
          Кейсийн JSON (каноник формат — <code className="text-xs">data/schema/case.schema.json</code>)
        </label>
        <textarea
          id="case-json"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="h-[70vh] w-full rounded-xl border border-slate-300 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={validate} disabled={pending !== null}>
            {pending === "validate" && <Spinner />}
            Шалгах ба урьдчилан харах
          </Button>
          <Button onClick={save} disabled={pending !== null}>
            {pending === "save" && <Spinner />}
            {mode === "create" ? "Ноорог болгон хадгалах" : "Хадгалах"}
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {parseError && <Alert>{parseError}</Alert>}
          {saveMessage && <Alert tone={saveMessage.ok ? "emerald" : "rose"}>{saveMessage.text}</Alert>}
        </div>
      </div>

      <aside className="space-y-4">
        {!result && (
          <Card className="p-4 text-sm text-slate-500">«Шалгах» дарж бүтэц, өгөгдлийн чанар болон оюутанд харагдах байдлыг шалгана уу.</Card>
        )}
        {result && !result.ok && (
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold text-rose-700">Шалгалт амжилтгүй ({result.issues.length})</p>
            <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto text-xs">
              {result.issues.map((i, idx) => (
                <li key={idx} className="rounded-lg bg-rose-50 px-2 py-1.5">
                  <code className="text-rose-800">{i.path}</code>
                  <span className="block text-rose-700">{i.message}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {result && result.ok && (
          <>
            <Card className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Оюутанд харагдах байдал</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="brand">{result.preview.specialty}</Badge>
                <Badge>{DIFFICULTY_LABELS[result.preview.difficulty]}</Badge>
                {result.preview.synthetic && <Badge tone="sky">Зохиомол</Badge>}
              </div>
              <p className="mt-2 font-semibold">{result.preview.displayTitle.mn}</p>
              <p className="mt-1 text-sm text-slate-600">
                {result.preview.patient.name}, {result.preview.patient.age} нас, {SEX_LABELS[result.preview.patient.sex]} — {result.preview.chiefComplaint.mn}
              </p>
              <p className="mt-1 text-xs text-slate-500">{result.preview.setting.mn}</p>
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">Өгөгдлийн чанар</p>
              {result.quality.length === 0 ? (
                <p className="text-sm text-emerald-700">Асуудал илрээгүй.</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {result.quality.map((q, idx) => (
                    <li key={idx} className={q.severity === "error" ? "text-rose-700" : q.severity === "warning" ? "text-amber-800" : "text-slate-600"}>
                      <Badge tone={q.severity === "error" ? "rose" : q.severity === "warning" ? "amber" : "slate"} className="mr-1">
                        {q.severity}
                      </Badge>
                      {q.message}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </aside>
    </div>
  );
}
