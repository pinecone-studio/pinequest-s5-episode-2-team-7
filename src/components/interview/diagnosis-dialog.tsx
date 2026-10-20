"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { COMMON_DIAGNOSES } from "@/lib/common-diagnoses";
import { apiFetch } from "@/lib/fetcher";
import { Alert, Button, Input, Label, Spinner, Textarea } from "../ui";

export function DiagnosisDialog({ open, onClose, sessionId, questionCount }: { open: boolean; onClose: () => void; sessionId: string; questionCount: number }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/sessions/${sessionId}/diagnosis`, {
        method: "POST",
        json: { diagnosis: String(form.get("diagnosis") ?? ""), reasoning: String(form.get("reasoning") ?? "") },
      });
      router.push(`/sessions/${sessionId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Алдаа гарлаа.");
      setPending(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="diagnosis-title"
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl p-0 shadow-2xl backdrop:bg-slate-900/40"
    >
      <form onSubmit={submit} className="space-y-4 p-6">
        <div>
          <h2 id="diagnosis-title" className="text-lg font-semibold">
            Сэжигтэй онош илгээх
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Илгээсний дараа ярилцлага дуусч, үнэлгээ гарна. Та {questionCount} асуулт асуусан байна.
          </p>
        </div>
        {questionCount < 3 && (
          <Alert tone="amber">Асуумж хэт цөөн байна. Илүү олон асуулт асууснаар үнэлгээ сайжирна.</Alert>
        )}
        {error && <Alert>{error}</Alert>}
        <div>
          <Label htmlFor="diagnosis">Онош</Label>
          <Input id="diagnosis" name="diagnosis" list="diagnosis-suggestions" required minLength={2} maxLength={300} autoComplete="off" placeholder="Жишээ нь: ..." />
          <datalist id="diagnosis-suggestions">
            {COMMON_DIAGNOSES.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-slate-400">Гол оношоо эхэнд бичнэ. Монгол эсвэл англиар бичиж болно.</p>
        </div>
        <div>
          <Label htmlFor="reasoning" hint="(заавал биш)">
            Үндэслэл
          </Label>
          <Textarea id="reasoning" name="reasoning" rows={4} maxLength={2000} placeholder="Ямар шинж тэмдэг, эрсдэлт хүчин зүйл энэ оношийг дэмжиж байна вэ?" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Буцах
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Spinner />}
            Илгээж, үнэлгээ авах
          </Button>
        </div>
      </form>
    </dialog>
  );
}
