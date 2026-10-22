"use client";

import { AnimatePresence, LayoutGroup, motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { ArrowRight, Clock, RotateCcw, Siren, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type PointerEvent, type ReactNode } from "react";
import { t } from "@/i18n";
import { api, describeError } from "@/lib/api";
import type { PublicCase } from "@/lib/views";
import { PatientView, moodForCase } from "../patient/patient-view";
import { useToast } from "../providers";
import { buttonClass, cn, Spinner } from "../ui";

export interface CaseProgress {
  best: number | null;
  attempts: number;
  /** Open interview to resume instead of starting a parallel one. */
  openSessionId: string | null;
}

const DIFFICULTY_DOT: Record<string, string> = { beginner: "bg-emerald-500", intermediate: "bg-amber-500", advanced: "bg-rose-500" };
const DIFFICULTIES = ["beginner", "intermediate", "advanced"];

export function CaseGrid({ cases, progress }: { cases: PublicCase[]; progress: Record<string, CaseProgress> }) {
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const specialties = useMemo(() => [...new Set(cases.map((c) => c.specialty))].sort((a, b) => a.localeCompare(b, "mn")), [cases]);
  const visible = cases.filter((c) => (!specialty || c.specialty === specialty) && (!difficulty || c.difficulty === difficulty));

  return (
    <div>
      <div className="mb-6 space-y-3">
        <ChipRow label={t.cases.filterSpecialty} id="specialty" value={specialty} onChange={setSpecialty} options={specialties.map((s) => [s, s])} />
        <ChipRow
          label={t.cases.filterDifficulty}
          id="difficulty"
          value={difficulty}
          onChange={setDifficulty}
          options={DIFFICULTIES.filter((d) => cases.some((c) => c.difficulty === d)).map((d) => [d, t.difficulty[d]])}
        />
      </div>

      <motion.div layout className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" style={{ perspective: 1200 }}>
        <AnimatePresence mode="popLayout">
          {visible.map((c, i) => (
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: Math.min(i, 8) * 0.04, type: "spring", stiffness: 300, damping: 28 } }}
              exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18 } }}
            >
              <TiltCard>
                <CaseCard c={c} progress={progress[c.id]} />
              </TiltCard>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
      {visible.length === 0 && <p className="py-12 text-center text-sm text-muted">{t.cases.empty}</p>}
    </div>
  );
}

function ChipRow({ label, id, value, onChange, options }: { label: string; id: string; value: string | null; onChange: (v: string | null) => void; options: [string, string][] }) {
  if (options.length < 2) return null;
  return (
    <LayoutGroup id={id}>
      <div role="radiogroup" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        {[[null, t.cases.all] as const, ...options].map(([key, text]) => {
          const active = value === key;
          return (
            <button
              key={key ?? "all"}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(key)}
              className={cn(
                "relative shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                active ? "text-accent-ink" : "glass text-muted hover:text-ink",
              )}
            >
              {active && <motion.span layoutId="chip" className="absolute inset-0 rounded-full bg-accent shadow-md shadow-brand-500/25" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
              <span className="relative">{text}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/** Lifts and tilts slightly towards the pointer (mouse only). */
function TiltCard({ children }: { children: ReactNode }) {
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(y, [0, 1], [5, -5]), { stiffness: 250, damping: 20 });
  const rotateY = useSpring(useTransform(x, [0, 1], [-6, 6]), { stiffness: 250, damping: 20 });

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width);
    y.set((e.clientY - rect.top) / rect.height);
  }
  function reset() {
    x.set(0.5);
    y.set(0.5);
  }

  return (
    <motion.div
      onPointerMove={onMove}
      onPointerLeave={reset}
      whileHover={{ y: -6 }}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      className="h-full rounded-3xl transition-shadow duration-300 hover:shadow-2xl hover:shadow-brand-900/10"
    >
      {children}
    </motion.div>
  );
}

function CaseCard({ c, progress }: { c: PublicCase; progress?: CaseProgress }) {
  const router = useRouter();
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  const mood = moodForCase(c);

  async function start() {
    setStarting(true);
    try {
      const id = await api.startSession(c.id);
      router.push(`/interview/${id}`);
    } catch (error) {
      const { message, offline } = describeError(error);
      toast({ message, tone: "error", action: offline ? { label: t.errors.useDemo, href: "/demo" } : undefined });
      setStarting(false);
    }
  }

  return (
    <article className="glass flex h-full flex-col overflow-hidden rounded-3xl">
      <div className="relative flex items-center gap-4 bg-gradient-to-br from-accent-soft to-transparent px-5 pb-4 pt-5">
        <PatientView sex={c.patient.sex} age={c.patient.age} mood={mood} speaking={false} size="sm" className="!h-14 !w-14" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-bold">{c.patient.name}</p>
          <p className="text-xs text-muted">{t.cases.ageSex(c.patient.age, t.sex[c.patient.sex])}</p>
        </div>
        {c.timeCritical && (
          <span className="flex items-center gap-1 rounded-full bg-alert-soft px-2 py-0.5 text-[11px] font-bold text-alert">
            <Siren size={12} aria-hidden />
            {t.cases.urgent}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-accent">{c.specialty}</span>
          <span className="flex items-center gap-1.5 text-muted">
            <span className={cn("h-2 w-2 rounded-full", DIFFICULTY_DOT[c.difficulty])} aria-hidden />
            {t.difficulty[c.difficulty] ?? c.difficulty}
          </span>
          <span className="flex items-center gap-1 text-subtle">
            <Clock size={12} aria-hidden />
            {t.cases.minutes(c.estimatedMinutes)}
          </span>
        </div>
        <h3 className="font-display text-lg font-bold leading-snug">{c.displayTitle.mn}</h3>
        <p className="mt-1 text-sm text-muted">{c.chiefComplaint.mn}</p>

        <div className="mt-auto pt-5">
          {progress && progress.best !== null && (
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Trophy size={13} className="text-amber-500" aria-hidden />
              {t.cases.best(Math.round(progress.best), progress.attempts)}
            </p>
          )}
          {progress?.openSessionId ? (
            <Link href={`/interview/${progress.openSessionId}`} className={buttonClass("secondary", "md", "group w-full")}>
              {t.cases.continue}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ) : (
            <button type="button" onClick={start} disabled={starting} className={buttonClass("primary", "md", "group w-full")}>
              {starting ? <Spinner /> : progress?.attempts ? <RotateCcw size={16} aria-hidden /> : null}
              {progress?.attempts ? t.cases.retry : t.cases.start}
              {!starting && <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden />}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
