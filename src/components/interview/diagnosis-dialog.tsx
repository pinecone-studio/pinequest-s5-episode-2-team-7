"use client";

import { AnimatePresence, motion } from "motion/react";
import { Stethoscope, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { t } from "@/i18n";
import { describeError, type DiagnosisPayload } from "@/lib/api";
import { COMMON_DIAGNOSES } from "@/lib/common-diagnoses";
import { saveConfidence } from "@/lib/confidence";
import { Alert, Button, Label, Spinner, Textarea, cn, inputClass } from "../ui";

interface DiagnosisDialogProps {
  open: boolean;
  onClose: () => void;
  questionCount: number;
  /** Key for the browser-only confidence value (shown on the results screen). */
  confidenceKey: string;
  onSubmit: (input: DiagnosisPayload) => Promise<void>;
}

export function DiagnosisDialog({ open, onClose, questionCount, confidenceKey, onSubmit }: DiagnosisDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [confidence, setConfidence] = useState(60);
  const [active, setActive] = useState(-1);
  const [showList, setShowList] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const suggestions = useMemo(() => {
    const q = diagnosis.trim().toLowerCase();
    if (q.length < 2) return [];
    return COMMON_DIAGNOSES.filter((d) => d.toLowerCase().includes(q) && d.toLowerCase() !== q).slice(0, 6);
  }, [diagnosis]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && !pending && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const focus = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      window.clearTimeout(focus);
    };
  }, [open, pending, onClose]);

  const levels = t.diagnosis.confidenceLevels;
  const level = levels[Math.min(levels.length - 1, Math.floor(confidence / (100 / levels.length)))];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (diagnosis.trim().length < 2) return;
    setPending(true);
    setError(null);
    saveConfidence(confidenceKey, { value: confidence, label: level });
    try {
      await onSubmit({ diagnosis: diagnosis.trim(), reasoning: reasoning.trim() });
    } catch (err) {
      setError(describeError(err).message);
      setPending(false);
    }
  }

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length || !showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      setDiagnosis(suggestions[active]);
      setShowList(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !pending && onClose()}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="diagnosis-title"
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-surface-solid shadow-2xl sm:rounded-3xl"
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden />
            <form onSubmit={submit} className="space-y-5 p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Stethoscope size={22} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="diagnosis-title" className="font-display text-lg font-bold">
                    {t.diagnosis.title}
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">{t.diagnosis.subtitle(questionCount)}</p>
                </div>
                <button type="button" onClick={onClose} disabled={pending} className="-m-1 rounded-lg p-1.5 text-subtle hover:bg-sunken hover:text-ink" aria-label={t.common.close}>
                  <X size={18} />
                </button>
              </div>

              {questionCount < 3 && <Alert tone="amber">{t.diagnosis.fewQuestions}</Alert>}
              {error && <Alert>{error}</Alert>}

              <div className="relative">
                <Label htmlFor="diagnosis">{t.diagnosis.label}</Label>
                <input
                  id="diagnosis"
                  ref={inputRef}
                  value={diagnosis}
                  onChange={(e) => {
                    setDiagnosis(e.target.value.slice(0, 300));
                    setShowList(true);
                    setActive(-1);
                  }}
                  onKeyDown={onInputKey}
                  onBlur={() => window.setTimeout(() => setShowList(false), 120)}
                  role="combobox"
                  aria-expanded={showList && suggestions.length > 0}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                  autoComplete="off"
                  required
                  minLength={2}
                  placeholder={t.diagnosis.placeholder}
                  className={cn(inputClass, "h-12 text-base")}
                />
                <AnimatePresence>
                  {showList && suggestions.length > 0 && (
                    <motion.ul
                      id={listId}
                      role="listbox"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-line bg-surface-solid py-1 shadow-xl"
                    >
                      {suggestions.map((s, i) => (
                        <li
                          key={s}
                          id={`${listId}-${i}`}
                          role="option"
                          aria-selected={i === active}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setDiagnosis(s);
                            setShowList(false);
                          }}
                          className={cn("cursor-pointer px-3.5 py-2 text-sm", i === active ? "bg-accent-soft text-accent" : "hover:bg-sunken")}
                        >
                          {s}
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
                <p className="mt-1.5 text-xs text-subtle">{t.diagnosis.help}</p>
              </div>

              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <label htmlFor="confidence" className="text-sm font-semibold">
                    {t.diagnosis.confidence}
                  </label>
                  <motion.span key={level} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-bold text-accent">
                    {level} · {confidence}%
                  </motion.span>
                </div>
                <input
                  id="confidence"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={confidence}
                  onChange={(e) => setConfidence(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full accent-[var(--accent)]"
                  style={{ background: `linear-gradient(90deg, var(--accent) ${confidence}%, var(--sunken) ${confidence}%)` }}
                  aria-valuetext={`${level}, ${confidence}%`}
                />
                <p className="mt-1.5 text-xs text-subtle">{t.diagnosis.confidenceNote}</p>
              </div>

              <div>
                <Label htmlFor="reasoning" hint={t.diagnosis.optional}>
                  {t.diagnosis.reasoning}
                </Label>
                <Textarea id="reasoning" value={reasoning} onChange={(e) => setReasoning(e.target.value)} rows={3} maxLength={2000} placeholder={t.diagnosis.reasoningPlaceholder} />
              </div>

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                  {t.diagnosis.cancel}
                </Button>
                <Button type="submit" size="lg" disabled={pending || diagnosis.trim().length < 2}>
                  {pending && <Spinner />}
                  {pending ? t.diagnosis.submitting : t.diagnosis.submit}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
