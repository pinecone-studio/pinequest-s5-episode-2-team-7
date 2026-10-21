import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, PlayCircle, Target } from "lucide-react";
import Link from "next/link";
import { CaseGrid, type CaseProgress } from "@/components/cases/case-grid";
import { CountUp } from "@/components/motion/count-up";
import { Blobs } from "@/components/motion/reveal";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import { t } from "@/i18n";
import { requirePageUser } from "@/lib/auth/server";
import { formatDateTime } from "@/lib/i18n";
import { listPublishedCases } from "@/lib/services/cases";
import { listSessions } from "@/lib/services/sessions";

export const metadata: Metadata = { title: "Кейсүүд" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const session = await requirePageUser("/dashboard");
  const [cases, sessions, params] = await Promise.all([listPublishedCases(), listSessions(session, { limit: 50 }), searchParams]);
  const active = sessions.filter((s) => s.status === "active");
  const completed = sessions.filter((s) => s.status === "completed");
  const avg = completed.length ? Math.round(completed.reduce((sum, s) => sum + (s.totalScore ?? 0), 0) / completed.length) : null;

  const progress: Record<string, CaseProgress> = {};
  for (const c of cases) {
    const attempts = completed.filter((s) => s.caseId === c.id);
    progress[c.id] = {
      best: attempts.length ? Math.max(...attempts.map((s) => s.totalScore ?? 0)) : null,
      attempts: attempts.length,
      openSessionId: active.find((s) => s.caseId === c.id)?.id ?? null,
    };
  }

  return (
    <main className="relative isolate mx-auto w-full max-w-6xl px-4 py-8">
      <Blobs fixed />
      <PageHeader title={t.cases.greeting(session.name)} subtitle={t.cases.subtitle} />
      {params.denied && (
        <div className="mb-6">
          <Alert tone="amber">Админ хуудсанд нэвтрэх эрх танд байхгүй.</Alert>
        </div>
      )}

      <div className="mb-8 grid grid-cols-3 gap-3 sm:max-w-xl">
        <Stat icon={<CheckCircle2 size={16} />} label={t.cases.statDone} value={completed.length} />
        <Stat icon={<Target size={16} />} label={t.cases.statAvg} value={avg} />
        <Stat icon={<PlayCircle size={16} />} label={t.cases.statActive} value={active.length} />
      </div>

      {active.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-display text-lg font-bold">{t.cases.continueTitle}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {active.slice(0, 4).map((s) => (
              <Link key={s.id} href={`/interview/${s.id}`} className="glass group flex items-center justify-between gap-4 rounded-2xl p-4 transition-transform hover:-translate-y-0.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{s.caseTitle}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(s.startedAt)} · {t.cases.questions(s.questionCount)}
                  </p>
                </div>
                <span className="flex items-center gap-1 text-sm font-semibold text-accent">
                  {t.cases.continue}
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 font-display text-xl font-bold">{t.cases.title}</h2>
        {cases.length === 0 ? <EmptyState title={t.cases.noCases} /> : <CaseGrid cases={cases} progress={progress} />}
      </section>

      {completed.length > 0 && (
        <p className="mt-10 text-sm">
          <Link href="/sessions" className="font-semibold text-accent hover:underline">
            {t.cases.historyLink}
          </Link>
        </p>
      )}
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | null }) {
  return (
    <Card className="px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <span className="text-accent" aria-hidden>
          {icon}
        </span>
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">{value === null ? "—" : <CountUp value={value} duration={1} />}</p>
    </Card>
  );
}
