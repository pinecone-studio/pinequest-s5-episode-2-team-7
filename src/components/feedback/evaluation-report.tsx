"use client";

import { AnimatePresence, motion, type Variants } from "motion/react";
import { ArrowRight, BookOpen, CheckCircle2, ChevronDown, CircleAlert, Gauge, Lightbulb, MessagesSquare, Search, Siren, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { loadConfidence, type Confidence } from "@/lib/confidence";
import type { EvaluationResult, RubricResult } from "@/lib/evaluation/evaluator";
import type { MessageView } from "@/lib/views";
import { Confetti } from "../motion/confetti";
import { Reveal } from "../motion/reveal";
import { ScoreRing } from "../score-ring";
import { Badge, buttonClass, cn } from "../ui";

const VERDICT_TONE = { correct: "emerald", partial: "amber", differential: "amber", incorrect: "rose", empty: "rose" } as const;

const list: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.12 } } };
const row: Variants = {
  hidden: { opacity: 0, x: -16 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 260, damping: 26 } },
};

interface ReportProps {
  result: EvaluationResult;
  narrative: string | null;
  submittedReasoning: string | null;
  /** Session id under which the browser-only confidence was stored. */
  confidenceKey: string;
  messages: MessageView[];
  patientName: string;
  casesHref: string;
}

export function EvaluationReport({ result, narrative, submittedReasoning, confidenceKey, messages, patientName, casesHref }: ReportProps) {
  const d = result.diagnosis;
  const asked = result.items.filter((i) => i.covered).sort((a, b) => Number(b.critical) - Number(a.critical) || b.weight - a.weight);
  const missed = result.items.filter((i) => !i.covered).sort((a, b) => Number(b.critical) - Number(a.critical) || b.weight - a.weight);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    // sessionStorage only exists in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfidence(loadConfidence(confidenceKey));
  }, [confidenceKey]);

  const correct = d.verdict === "correct";
  const calibration = confidence ? (correct ? (confidence.value >= 50 ? t.feedback.calibrationGood : t.feedback.calibrationUnder) : confidence.value >= 70 ? t.feedback.calibrationOver : t.feedback.calibrationGood) : null;

  function reviewConversation() {
    setShowTranscript(true);
    window.setTimeout(() => document.getElementById("transcript")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  return (
    <div className="space-y-6">
      <Confetti fire={correct} />

      {/* Score hero */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass grid gap-8 rounded-[2rem] p-6 sm:p-8 md:grid-cols-[auto_1fr]"
      >
        <div className="flex flex-col items-center justify-center">
          <ScoreRing score={result.totalScore} size={168} label={t.feedback.total} />
          <p className="mt-2 text-xs font-semibold text-subtle">{t.feedback.outOf}</p>
        </div>
        <div className="min-w-0">
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.2, type: "spring", stiffness: 300, damping: 18 }}>
            <Badge tone={VERDICT_TONE[d.verdict]} className="px-3 py-1 text-sm">
              {correct ? <CheckCircle2 size={15} /> : d.verdict === "incorrect" || d.verdict === "empty" ? <XCircle size={15} /> : <CircleAlert size={15} />}
              {t.feedback.verdict[d.verdict]}
            </Badge>
          </motion.div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-sunken p-4">
              <dt className="text-xs font-semibold text-subtle">{t.feedback.yourDiagnosis}</dt>
              <dd className="mt-1 font-display text-lg font-bold">{d.submitted}</dd>
            </div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5 }} className="rounded-2xl bg-accent-soft p-4">
              <dt className="text-xs font-semibold text-accent">{t.feedback.expected}</dt>
              <dd className="mt-1 font-display text-lg font-bold">
                {d.expected}
                {d.expectedEn && <span className="block text-xs font-medium text-muted">{d.expectedEn}</span>}
              </dd>
            </motion.div>
          </dl>
          <ul className="mt-3 space-y-1 text-sm text-muted">
            {d.notLeading && <li>• Зөв оношийг бичсэн боловч гол (эхний) онош болгоогүй тул хэсэгчилсэн оноо авлаа.</li>}
            {d.fuzzy && <li>• Бичлэгийн жижиг алдааг тэвчиж, «{d.matchedTerm}» гэж хүлээн авлаа.</li>}
            {d.verdict === "differential" && <li>• «{d.differential}» нь энэ кейсийн ялган оношийн нэг — гол оношоос ялгах шинжийг доороос харна уу.</li>}
          </ul>
          {confidence && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="flex items-center gap-1.5 font-semibold">
                <Gauge size={15} className="text-accent" aria-hidden />
                {t.feedback.confidence(confidence.label, confidence.value)}
              </span>
              <span className="text-muted">— {calibration}</span>
            </p>
          )}
          {submittedReasoning && <p className="prose-mn mt-3 text-sm text-muted">«{submittedReasoning}»</p>}
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href={casesHref} className={buttonClass("primary", "lg", "group rounded-2xl")}>
              {t.feedback.tryAnother}
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <button type="button" onClick={reviewConversation} className={buttonClass("secondary", "lg", "rounded-2xl")}>
              <MessagesSquare size={18} aria-hidden />
              {t.feedback.review}
            </button>
          </div>
        </div>
      </motion.section>

      {/* Breakdown */}
      <Reveal className="glass rounded-3xl p-6">
        <h2 className="font-display text-lg font-bold">{t.feedback.breakdown}</h2>
        <p className="mt-1 text-xs text-subtle">
          {t.feedback.weights(Math.round(result.weights.diagnosis * 100), Math.round(result.weights.history * 100), Math.round(result.weights.critical * 100))}
        </p>
        <div className="mt-5 space-y-4">
          <ScoreBar label={t.feedback.compDiagnosis} points={result.components.diagnosis.points} max={result.weights.diagnosis * 100} />
          <ScoreBar
            label={t.feedback.compHistory}
            detail={t.feedback.ofQuestions(result.components.history.covered, result.components.history.total)}
            points={result.components.history.points}
            max={result.weights.history * 100}
            delay={0.15}
          />
          <ScoreBar
            label={t.feedback.compCritical}
            detail={t.feedback.ofQuestions(result.components.critical.covered, result.components.critical.total)}
            points={result.components.critical.points}
            max={result.weights.critical * 100}
            delay={0.3}
          />
        </div>
        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {result.categories.map((cat) => (
            <div key={cat.category} className="flex items-center justify-between rounded-xl bg-sunken px-3 py-2 text-sm">
              <span className="text-muted">{t.feedback.categories[cat.category] ?? cat.category}</span>
              <span className={cn("font-bold tabular-nums", cat.covered === cat.total ? "text-ok" : cat.covered === 0 ? "text-alert" : "text-warn")}>
                {cat.covered}/{cat.total}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-subtle">{t.feedback.stats(result.questionStats.total, result.questionStats.clinical, result.questionStats.repeated)}</p>
      </Reveal>

      {/* Asked vs missed, revealed one by one */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RubricList title={`${t.feedback.asked} (${asked.length})`} tone="ok" items={asked} empty={t.feedback.askedEmpty} />
        <RubricList title={`${t.feedback.missed} (${missed.length})`} tone="alert" items={missed} empty={t.feedback.missedEmpty} />
      </div>

      <Reveal className="glass rounded-3xl p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Search size={18} className="text-accent" aria-hidden />
          {t.feedback.findings}
        </h2>
        {result.discoveredFindings.length > 0 && (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {result.discoveredFindings.map((f) => (
              <li key={f.factId} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-3 text-sm">
                <p>«{f.text}»</p>
                {f.significance && <p className="mt-1.5 text-emerald-700 dark:text-emerald-300">→ {f.significance}</p>}
              </li>
            ))}
          </ul>
        )}
        {result.missedFindings.length > 0 && (
          <details className="mt-4 rounded-2xl border border-line p-3 text-sm">
            <summary className="cursor-pointer font-semibold">{t.feedback.missedFindings(result.missedFindings.length)}</summary>
            <ul className="mt-3 space-y-2">
              {result.missedFindings.map((f) => (
                <li key={f.factId}>
                  «{f.text}»{f.significance && <span className="block text-xs text-muted">{f.significance}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-2">
        <Reveal className="glass rounded-3xl p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <BookOpen size={18} className="text-accent" aria-hidden />
            {t.feedback.explanation}
          </h2>
          <p className="prose-mn mt-3 text-sm">{d.explanation}</p>
          {result.differentials.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-bold">{t.feedback.differentials}</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {result.differentials.map((x) => (
                  <li key={x.label}>
                    <span className="font-semibold">{x.label}:</span> <span className="text-muted">{x.rationale}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Reveal>
        <Reveal className="glass rounded-3xl p-6" delay={0.1}>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Lightbulb size={18} className="text-amber-500" aria-hidden />
            {t.feedback.learning}
          </h2>
          <p className="prose-mn mt-3 text-sm">{result.summary}</p>
          <ul className="mt-4 space-y-2 text-sm">
            {result.learningPoints.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                <span className="prose-mn">{p}</span>
              </li>
            ))}
          </ul>
          {narrative && (
            <div className="mt-5 rounded-2xl bg-sunken p-3 text-sm">
              <p className="mb-1 text-xs font-semibold text-subtle">{t.feedback.narrative}</p>
              <p className="prose-mn whitespace-pre-line">{narrative}</p>
            </div>
          )}
        </Reveal>
      </div>

      {result.emergencyNote && (
        <Reveal className="flex gap-3 rounded-3xl border border-alert/30 bg-alert-soft p-5 text-sm">
          <Siren size={20} className="shrink-0 text-alert" aria-hidden />
          <div>
            <p className="font-bold text-alert">{t.feedback.emergency}</p>
            <p className="prose-mn mt-1">{result.emergencyNote}</p>
          </div>
        </Reveal>
      )}

      {/* Transcript */}
      <section id="transcript" className="glass scroll-mt-20 rounded-3xl">
        <button
          type="button"
          onClick={() => setShowTranscript((v) => !v)}
          aria-expanded={showTranscript}
          className="flex w-full items-center justify-between gap-3 p-6 text-left font-display text-lg font-bold"
        >
          {t.feedback.transcript(messages.length)}
          <ChevronDown size={20} className={cn("transition-transform", showTranscript && "rotate-180")} aria-hidden />
        </button>
        <AnimatePresence initial={false}>
          {showTranscript && (
            <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-2 overflow-hidden px-6 pb-6 text-sm">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={cn(
                    "rounded-xl px-3 py-2",
                    m.role === "student" && "ml-8 bg-accent-soft",
                    m.role === "patient" && "mr-8 bg-sunken",
                    m.role === "narrator" && "border border-emerald-500/25 bg-emerald-500/8",
                  )}
                >
                  <span className="mr-2 text-xs font-bold text-muted">{m.role === "student" ? t.consult.you : m.role === "narrator" ? t.consult.exam : patientName}</span>
                  <span className="prose-mn whitespace-pre-line">{m.content}</span>
                </li>
              ))}
            </motion.ol>
          )}
        </AnimatePresence>
      </section>

      <p className="text-xs text-subtle">{t.feedback.disclaimer}</p>
    </div>
  );
}

function ScoreBar({ label, points, max, detail, delay = 0 }: { label: string; points: number; max: number; detail?: string; delay?: number }) {
  const pct = max > 0 ? Math.round((points / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-semibold">
          {label}
          {detail && <span className="ml-2 text-xs font-normal text-subtle">{detail}</span>}
        </span>
        <span className="tabular-nums text-muted">
          {Math.round(points * 10) / 10} / {Math.round(max)}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <motion.div
          className={cn("h-full origin-left rounded-full", pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500")}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: pct / 100 }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}

function RubricList({ title, tone, items, empty }: { title: string; tone: "ok" | "alert"; items: RubricResult[]; empty: string }) {
  return (
    <section className="glass rounded-3xl p-6">
      <h2 className={cn("flex items-center gap-2 font-display text-lg font-bold", tone === "ok" ? "text-ok" : "text-alert")}>
        {tone === "ok" ? <CheckCircle2 size={19} aria-hidden /> : <XCircle size={19} aria-hidden />}
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <motion.ul variants={list} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} className="mt-4 space-y-3">
          {items.map((item) => (
            <motion.li
              key={item.id}
              variants={row}
              className={cn("rounded-2xl border p-3.5 text-sm", item.covered ? "border-emerald-500/20" : item.critical ? "border-alert/30 bg-alert-soft" : "border-line")}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">{item.label}</span>
                {item.critical && <Badge tone={item.covered ? "emerald" : "rose"}>{t.feedback.critical}</Badge>}
                <Badge>{t.feedback.categories[item.category] ?? item.category}</Badge>
              </div>
              <p className="mt-1.5 text-muted">
                {item.covered && item.evidence ? t.feedback.yourQuestion : t.feedback.exampleQuestion}:{" "}
                <span className="italic text-ink">«{item.covered && item.evidence ? item.evidence.text : item.suggestedQuestion}»</span>
              </p>
              <p className="mt-1 text-xs text-subtle">
                {t.feedback.why}: {item.rationale}
              </p>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}
