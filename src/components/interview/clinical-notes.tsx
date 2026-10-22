"use client";

import { AnimatePresence, motion } from "motion/react";
import { ClipboardList, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { t } from "@/i18n";
import { buildNotes, type NoteCategory } from "@/lib/clinical-notes";
import type { MessageView } from "@/lib/views";
import { cn } from "../ui";

const TONE: Record<NoteCategory | "custom", string> = {
  onset: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  location: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  radiation: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  character: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  severity: "bg-alert-soft text-alert",
  duration: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  associated: "bg-accent-soft text-accent",
  negative: "bg-sunken text-muted",
  history: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  meds: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  social: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  family: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  exam: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  custom: "bg-accent text-accent-ink",
};

export function ClinicalNotes({ messages, storageKey }: { messages: MessageView[]; storageKey: string }) {
  const auto = useMemo(() => buildNotes(messages.filter((m) => !m.id.startsWith("pending-"))), [messages]);
  const [custom, setCustom] = useState<{ id: string; text: string }[]>([]);
  const [draft, setDraft] = useState("");

  // Restore after hydration (sessionStorage does not exist on the server).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(saved) && saved.length) setCustom(saved);
    } catch {
      // Ignore unreadable storage.
    }
  }, [storageKey]);

  function save(next: { id: string; text: string }[]) {
    setCustom(next);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Storage unavailable: notes live for this page view only.
    }
  }

  function add(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    save([...custom, { id: `c-${Date.now()}`, text: text.slice(0, 200) }]);
    setDraft("");
  }

  const items = [...auto.map((n) => ({ ...n, custom: false })), ...custom.map((c) => ({ ...c, category: "custom" as const, custom: true }))];

  return (
    <section aria-label={t.consult.notes} className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-sm font-bold">
          <ClipboardList size={16} className="text-accent" aria-hidden />
          {t.consult.notes}
        </h2>
        <span className="rounded-full bg-sunken px-2 py-0.5 text-xs font-semibold tabular-nums text-muted">{items.length}</span>
      </div>
      <p className="mb-3 text-xs text-subtle">{t.consult.notesHint}</p>

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1" aria-live="polite">
        {items.length === 0 && (
          <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-subtle">{t.consult.notesEmpty}</li>
        )}
        <AnimatePresence initial={false}>
          {items.map((note) => (
            <motion.li
              key={note.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="group rounded-xl border border-line bg-surface-solid px-3 py-2 text-[13px] leading-snug"
            >
              <div className="flex items-start gap-2">
                <span className={cn("mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", TONE[note.category])}>
                  {note.category === "custom" ? t.notes.custom : t.notes[note.category]}
                </span>
                <span className="prose-mn min-w-0 flex-1 text-ink">{note.text}</span>
                {note.custom && (
                  <button
                    type="button"
                    onClick={() => save(custom.filter((c) => c.id !== note.id))}
                    className="shrink-0 rounded p-0.5 text-subtle opacity-60 hover:text-alert group-hover:opacity-100"
                    aria-label={t.common.close}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <form onSubmit={add} className="mt-3 flex gap-2">
        <label htmlFor="custom-note" className="sr-only">
          {t.consult.notesAdd}
        </label>
        <input
          id="custom-note"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.consult.notesAdd}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface-solid px-3 text-sm placeholder:text-subtle focus:border-accent focus:outline-none"
        />
        <button type="submit" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent hover:bg-accent hover:text-accent-ink" aria-label={t.consult.notesAdd}>
          <Plus size={16} />
        </button>
      </form>
    </section>
  );
}
