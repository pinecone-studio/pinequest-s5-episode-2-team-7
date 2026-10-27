"use client";

import { BarChart3, ClipboardList, Flame, Target, UserRound } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/components/ui";
import { scoreColor } from "@/lib/coach/labels";
import { formatDateTime } from "@/lib/i18n";
import { scenarioHistory } from "@/lib/practice/history";
import { quizHistory } from "@/lib/quiz-client";

export interface CoachResultSummary {
  id: string;
  packTitle: string;
  score: number;
  summary: string;
  improvements: string[];
  challengeId: string | null;
  createdAt: string;
}

const average = (scores: number[]) => (scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null);

/**
 * «Дүгнэлт»: every piece of feedback in one place — AI дасгалжуулагч
 * conversations (from the server) and «Сорил» attempts (kept in this browser).
 */
export function FeedbackList({ results }: { results: CoachResultSummary[] }) {
  const attempts = useSyncExternalStore(quizHistory.subscribe, quizHistory.snapshot, quizHistory.serverSnapshot);
  const cases = useSyncExternalStore(scenarioHistory.subscribe, scenarioHistory.snapshot, scenarioHistory.serverSnapshot);
  const coachAverage = average(results.map((r) => r.score));
  const quizAverage = average(attempts.map((a) => a.grade.score));
  const focus = [...results.slice(0, 5).flatMap((r) => r.improvements), ...attempts.slice(0, 3).flatMap((a) => a.grade.weaknesses)].slice(0, 4);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2.5">
        <StatTile value={coachAverage ?? "–"} label="Дасгалжуулагч" icon={<UserRound size={14} aria-hidden />} />
        <StatTile value={quizAverage ?? "–"} label="Сорил" icon={<ClipboardList size={14} aria-hidden />} />
        <StatTile value={results.length + attempts.length + cases.length} label="Нийт дадлага" icon={<Flame size={14} aria-hidden />} />
      </div>

      {focus.length > 0 && (
        <section className="rounded-3xl bg-[#271c22]/90 p-4">
          <h2 className="mb-2 flex items-center gap-1.5 font-semibold text-warn">
            <Target size={16} aria-hidden /> Анхаарах зүйлс
          </h2>
          <ul className="space-y-1 text-sm text-ink">
            {focus.map((f) => (
              <li key={f}>• {f}</li>
            ))}
          </ul>
        </section>
      )}

      {results.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-lg font-semibold text-ink">AI дасгалжуулагч</h2>
          {results.map((r) => (
            <Link key={r.id} href={`/feedback/${r.id}`} className="block">
              <ScoreRow score={r.score} title={`💬 ${r.packTitle}`} detail={r.summary} date={r.createdAt} badge={r.challengeId ? "Сорилт" : null} />
            </Link>
          ))}
        </section>
      )}

      {attempts.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-lg font-semibold text-ink">Сорил</h2>
          {attempts.map((a) => (
            <Link key={a.id} href={`/soril?attempt=${a.id}`} className="block">
              <ScoreRow score={a.grade.score} title={`📝 ${a.quiz.title}`} detail={a.grade.verdict} date={a.date} badge={null} />
            </Link>
          ))}
        </section>
      )}

      {cases.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-lg font-semibold text-ink">Яаралтай тохиолдол</h2>
          {cases.map((c) => (
            <Link key={c.id} href={`/cases/${c.scenarioId}`} className="block">
              <ScoreRow score={c.score} title={`🚑 ${c.title}`} detail={c.stable ? "Тогтворжсон" : "Дордсон"} date={c.date} badge={null} />
            </Link>
          ))}
        </section>
      )}

      {results.length === 0 && attempts.length === 0 && cases.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <BarChart3 size={40} className="text-subtle" aria-hidden />
          <p className="font-semibold text-ink">Дүгнэлт алга</p>
          <p className="max-w-xs text-sm text-muted">AI дасгалжуулагчтай ярилцах эсвэл Сорил өгөхөд энд оноо, санал хадгалагдана.</p>
        </div>
      )}
    </div>
  );
}

function StatTile({ value, label, icon }: { value: string | number; label: string; icon: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[20px] bg-field py-3.5 ring-1 ring-line">
      <span className="text-accent">{icon}</span>
      <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
      <span className="truncate text-[11px] text-muted">{label}</span>
    </div>
  );
}

export function ScoreRow({ score, title, detail, date, badge }: { score: number; title: string; detail: string; date: string; badge: string | null }) {
  return (
    <div className="glass flex items-center gap-3.5 rounded-[20px] p-3">
      <span className={cn("flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full font-semibold tabular-nums", scoreColor(score))}>{score}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-ink">{title}</span>
          {badge && <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-deep">{badge}</span>}
        </span>
        <span className="line-clamp-2 text-xs text-muted">{detail}</span>
        <span className="text-[11px] text-subtle">{formatDateTime(date)}</span>
      </span>
    </div>
  );
}
