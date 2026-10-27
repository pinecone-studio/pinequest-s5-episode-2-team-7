"use client";

import { ClipboardList, Flame, HeartPulse, Target, UserRound } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/components/ui";
import { scoreColor } from "@/lib/coach/labels";
import { scenarioHistory } from "@/lib/practice/history";
import { quizHistory } from "@/lib/quiz-client";

export interface CoachResultBrief {
  packTitle: string;
  score: number;
  improvements: string[];
  createdAt: string;
}

const average = (scores: number[]) => (scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null);

function useLocalHistory() {
  const attempts = useSyncExternalStore(quizHistory.subscribe, quizHistory.snapshot, quizHistory.serverSnapshot);
  const cases = useSyncExternalStore(scenarioHistory.subscribe, scenarioHistory.snapshot, scenarioHistory.serverSnapshot);
  return { attempts, cases };
}

/** Days in a row (ending today or yesterday) with at least one case, quiz or conversation. */
const noSubscribe = () => () => {};

export function StreakBadge({ coachDates }: { coachDates: string[] }) {
  const { attempts, cases } = useLocalHistory();
  // "Today" is the viewer's day, which the server cannot know: render after hydration only.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const local = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const days = new Set([...coachDates, ...attempts.map((a) => a.date), ...cases.map((c) => c.date)].map((d) => local(new Date(d))));
  const cursor = new Date();
  if (!days.has(local(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(local(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  if (!hydrated || streak === 0) return null;
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/55" aria-label={`${streak} өдөр дараалан дадлага хийсэн`}>
      <Flame size={16} aria-hidden /> {streak} өдөр
    </span>
  );
}

/** «Миний ахиц» and the weak spots from the last conversation and «Сорил» (as on the iOS home screen). */
export function HomeProgress({ coach, medical }: { coach: CoachResultBrief[]; medical: boolean }) {
  const { attempts, cases } = useLocalHistory();
  const empty = coach.length === 0 && attempts.length === 0 && cases.length === 0;
  const last = coach[0];
  const studyNext = attempts[0]?.grade.studyNext.slice(0, 3) ?? [];

  return (
    <>
      <section className="space-y-3">
        <Header title="Миний ахиц" action={empty ? null : { href: "/feedback", label: "Дүгнэлт" }} />
        <div className="grid grid-cols-3 gap-2.5">
          <Stat value={average(coach.map((r) => r.score))} label="Дасгалжуулагч" icon={<UserRound size={14} aria-hidden />} />
          <Stat value={average(attempts.map((a) => a.grade.score))} label="Сорилын оноо" icon={<ClipboardList size={14} aria-hidden />} />
          {medical ? (
            <Stat value={average(cases.map((c) => c.score))} label="Тохиолдол" icon={<HeartPulse size={14} aria-hidden />} />
          ) : (
            <Stat value={coach.length + attempts.length} label="Нийт дадлага" icon={<Flame size={14} aria-hidden />} />
          )}
        </div>
        {empty && <p className="text-xs text-muted">Эхний дадлагаа хийхэд ахиц энд харагдана.</p>}
      </section>

      {last && last.improvements.length > 0 && (
        <section className="space-y-3">
          <Header title="Сүүлийн яриан дээрх санал" action={{ href: "/feedback", label: "Дэлгэрэнгүй" }} />
          <div className="glass space-y-1.5 rounded-[22px] p-3.5">
            <p className={cn("text-xs font-semibold", scoreColor(last.score).split(" ")[0])}>
              {last.packTitle} · {last.score} оноо
            </p>
            {last.improvements.map((s) => (
              <p key={s} className="text-sm">
                • {s}
              </p>
            ))}
          </div>
        </section>
      )}

      {studyNext.length > 0 && (
        <section className="space-y-3">
          <Header title="Сул тал дээрээ ажиллах" action={null} />
          {studyNext.map((topic) => (
            <Link key={topic.topic} href={`/soril?topic=${encodeURIComponent(topic.topic)}`} className="glass flex items-center gap-3 rounded-[22px] p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warn/12 text-warn">
                <Target size={18} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{topic.topic}</span>
                <span className="line-clamp-2 text-xs text-muted">{topic.why}</span>
              </span>
              <span className="text-xs font-semibold text-accent-deep">Давтах</span>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}

export function Header({ title, action }: { title: string; action: { href: string; label: string } | null }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {action && (
        <Link href={action.href} className="text-sm text-muted hover:text-ink">
          {action.label}
        </Link>
      )}
    </div>
  );
}

function Stat({ value, label, icon }: { value: number | null; label: string; icon: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[20px] bg-field py-3.5 ring-1 ring-line">
      <span className="text-accent">{icon}</span>
      <span className="text-2xl font-semibold tabular-nums text-ink">{value ?? "–"}</span>
      <span className="truncate text-[11px] text-muted">{label}</span>
    </div>
  );
}
