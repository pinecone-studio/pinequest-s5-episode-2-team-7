import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requirePageAdmin } from "@/lib/auth/server";
import { SESSION_STATUS_LABELS, VERDICT_LABELS, formatDateTime } from "@/lib/i18n";
import { listSessions } from "@/lib/services/sessions";
import { listTrainingExamples } from "@/lib/services/training";

export const metadata: Metadata = { title: "Админ — Ярилцлага" };

export default async function AdminSessionsPage() {
  const { session } = await requirePageAdmin("/admin/sessions");
  const [sessions, examples] = await Promise.all([listSessions(session, { all: true, limit: 200 }), listTrainingExamples()]);
  const reviewed = new Map(examples.map((e) => [e.sessionId, e.status]));

  return (
    <main className="space-y-6">
      <PageHeader
        title="Ярилцлага ба сургалтын өгөгдөл"
        subtitle="Дууссан ярилцлагыг нээж, асуулт-хариултыг fine-tuning өгөгдөлд зөвшөөрөх эсвэл татгалзана. Хувийн мэдээлэлгүй эсэхийг шалгана уу."
      />
      <div className="grid grid-cols-3 gap-3 sm:max-w-md">
        <Card className="px-4 py-3">
          <p className="text-xs text-slate-500">Ярилцлага</p>
          <p className="text-xl font-semibold">{sessions.length}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs text-slate-500">Зөвшөөрсөн</p>
          <p className="text-xl font-semibold">{examples.filter((e) => e.status === "approved").length}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs text-slate-500">Татгалзсан</p>
          <p className="text-xl font-semibold">{examples.filter((e) => e.status === "rejected").length}</p>
        </Card>
      </div>
      {sessions.length === 0 ? (
        <EmptyState title="Ярилцлага алга" />
      ) : (
        <Card className="divide-y divide-slate-100">
          {sessions.map((s) => (
            <Link key={s.id} href={`/sessions/${s.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.caseTitle}</p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(s.startedAt)} · {s.questionCount} асуулт · <code className="text-[11px]">{s.id.slice(0, 8)}</code>
                </p>
              </div>
              <Badge>{SESSION_STATUS_LABELS[s.status]}</Badge>
              {s.diagnosisVerdict && <Badge className="hidden sm:inline-flex">{VERDICT_LABELS[s.diagnosisVerdict]}</Badge>}
              {s.totalScore !== null && <span className="w-10 text-right font-semibold tabular-nums">{Math.round(s.totalScore)}</span>}
              {reviewed.has(s.id) && <Badge tone={reviewed.get(s.id) === "approved" ? "emerald" : "rose"}>{reviewed.get(s.id) === "approved" ? "Сургалтад" : "Татгалзсан"}</Badge>}
            </Link>
          ))}
        </Card>
      )}
    </main>
  );
}
