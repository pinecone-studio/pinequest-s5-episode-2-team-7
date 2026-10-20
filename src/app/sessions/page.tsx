import type { Metadata } from "next";
import Link from "next/link";
import { scoreTone } from "@/components/score-ring";
import { Badge, buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/auth/server";
import { SESSION_STATUS_LABELS, VERDICT_LABELS, formatDateTime } from "@/lib/i18n";
import { listSessions } from "@/lib/services/sessions";

export const metadata: Metadata = { title: "Ярилцлагын түүх" };

export default async function SessionsPage() {
  const auth = await requirePageUser("/sessions");
  const sessions = await listSessions(auth);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <PageHeader title="Ярилцлагын түүх" subtitle="Таны өмнөх ярилцлага, оноо, санал хүсэлт. Зөвхөн танд харагдана." />
      {sessions.length === 0 ? (
        <EmptyState
          title="Одоогоор ярилцлага алга"
          action={
            <Link href="/dashboard" className={buttonClass("primary")}>
              Кейс сонгох
            </Link>
          }
        >
          Эхний ярилцлагаа эхлүүлээрэй.
        </EmptyState>
      ) : (
        <Card className="divide-y divide-slate-100">
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={s.status === "active" ? `/interview/${s.id}` : `/sessions/${s.id}`}
              className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.caseTitle}</p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(s.startedAt)} · {s.specialty} · {s.questionCount} асуулт
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {s.diagnosisVerdict && <Badge className="hidden sm:inline-flex">Онош: {VERDICT_LABELS[s.diagnosisVerdict] ?? s.diagnosisVerdict}</Badge>}
                {s.totalScore !== null ? (
                  <span className={`w-10 text-right text-lg font-semibold tabular-nums ${scoreTone(s.totalScore).text}`}>{Math.round(s.totalScore)}</span>
                ) : (
                  <Badge tone={s.status === "active" ? "emerald" : "slate"}>{SESSION_STATUS_LABELS[s.status]}</Badge>
                )}
              </div>
            </Link>
          ))}
        </Card>
      )}
    </main>
  );
}
