"use client";

import { AnimatePresence, motion, type Variants } from "motion/react";
import { ArrowRight, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { EcgStrip } from "../motion/ecg";
import { PatientView } from "../patient/patient-view";
import { buttonClass } from "../ui";

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

export function HeroCopy({ startHref }: { startHref: string }) {
  return (
    <motion.div variants={container} initial="hidden" animate="show">
      <motion.p variants={item} className="glass mb-6 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold text-accent">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        {t.landing.eyebrow}
      </motion.p>
      <h1 className="font-display text-[2.6rem] font-extrabold leading-[1.05] text-ink sm:text-6xl lg:text-[4.2rem]">
        <motion.span variants={item} className="block">
          {t.landing.titleA}
        </motion.span>
        <motion.span variants={item} className="block bg-gradient-to-r from-brand-500 via-cyan-500 to-sky-500 bg-clip-text pb-1 text-transparent">
          {t.landing.titleB}
        </motion.span>
      </h1>
      <motion.p variants={item} className="prose-mn mt-6 max-w-xl text-lg text-muted">
        {t.landing.tagline}
      </motion.p>
      <motion.div variants={item} className="mt-9 flex flex-wrap items-center gap-3">
        <Link href={startHref} className={buttonClass("primary", "lg", "group h-14 animate-pulse-glow rounded-2xl px-7 text-lg")}>
          {t.landing.start}
          <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" aria-hidden />
        </Link>
        <Link href="/demo" className={buttonClass("secondary", "lg", "h-14 rounded-2xl")}>
          <PlayCircle size={20} className="text-accent" aria-hidden />
          {t.landing.tryDemo}
        </Link>
      </motion.div>
      <motion.dl variants={item} className="mt-10 flex gap-8">
        {t.landing.stats.map((s) => (
          <div key={s.label}>
            <dt className="sr-only">{s.label}</dt>
            <dd className="font-display text-2xl font-extrabold text-ink">{s.value}</dd>
            <dd className="text-xs text-muted">{s.label}</dd>
          </div>
        ))}
      </motion.dl>
    </motion.div>
  );
}

/** Live-looking preview: the patient answers a question on a loop. */
export function HeroPreview() {
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    const steps = [1400, 1600, 3600];
    const id = window.setTimeout(() => setPhase((p) => ((p + 1) % 3) as 0 | 1 | 2), steps[phase]);
    return () => window.clearTimeout(id);
  }, [phase]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, rotate: 2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.9, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="glass relative mx-auto w-full max-w-md rounded-[2rem] p-6"
    >
      <div className="flex items-center gap-4">
        <PatientView sex="male" age={58} mood="pain" speaking={phase === 2} size="md" />
        <div>
          <p className="font-display text-lg font-bold">{t.landing.previewPatient}</p>
          <p className="text-sm text-muted">{t.landing.previewComplaint}</p>
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-alert-soft px-2 py-0.5 text-xs font-bold tabular-nums text-alert">
            <span className="h-1.5 w-1.5 animate-alarm rounded-full bg-alert" />
            108 bpm
          </p>
        </div>
      </div>
      <div className="mt-6 flex min-h-36 flex-col gap-3 text-[15px]">
        <AnimatePresence mode="popLayout">
          {phase >= 1 && (
            <motion.p
              key="q"
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-accent-ink"
            >
              {t.landing.previewQ}
            </motion.p>
          )}
          {phase === 1 && (
            <motion.span key="dots" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex w-fit gap-1.5 rounded-2xl rounded-bl-md bg-sunken px-4 py-3.5">
              <span className="typing-dot h-2 w-2 rounded-full bg-subtle" />
              <span className="typing-dot h-2 w-2 rounded-full bg-subtle" />
              <span className="typing-dot h-2 w-2 rounded-full bg-subtle" />
            </motion.span>
          )}
          {phase === 2 && (
            <motion.p
              key="a"
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-[85%] rounded-2xl rounded-bl-md bg-sunken px-4 py-2.5 text-ink"
            >
              {t.landing.previewA}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <div className="-mx-6 -mb-6 mt-4 overflow-hidden rounded-b-[2rem] bg-[#07131f] px-4 py-2">
        <EcgStrip heartRate={108} alarm className="h-10" />
      </div>
    </motion.div>
  );
}
