import type { Metadata } from "next";
import Link from "next/link";
import { StartCaseButton } from "@/components/start-case-button";
import { scoreTone } from "@/components/score-ring";
import { Alert, Badge, buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/auth/server";
import { DIFFICULTY_LABELS, NEWS_CATEGORY_LABELS, SEX_LABELS, formatDateTime } from "@/lib/i18n";
import { listPublishedCases } from "@/lib/services/cases";
import { listPublishedNews } from "@/lib/services/news";
import { listSessions } from "@/lib/services/sessions";

export const metadata: Metadata = { title: "Кейсүүд" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const session = await requirePageUser("/dashboard");
  const [cases, sessions, news, params] = await Promise.all([listPublishedCases(), listSessions(session, { limit: 50 }), listPublishedNews(3), searchParams]);
  const active = sessions.filter((s) => s.status === "active");
  const completed = sessions.filter((s) => s.status === "completed");
  const avg = completed.length ? Math.round(completed.reduce((sum, s) => sum + (s.totalScore ?? 0), 0) / completed.length) : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <PageHeader
        title={`Сайн байна уу, ${session.name}`}
        subtitle="Өвчтөнөө сонгоод асуумжаа эхлүүлээрэй. Онош болон далд мэдээлэл ярилцлагын төгсгөлд л харагдана."
      />
      {params.denied && (
        <div className="mb-6">
          <Alert tone="amber">Админ хуудсанд нэвтрэх эрх танд байхгүй.</Alert>
        </div>
      )}

      <div className="mb-8 grid grid-cols-3 gap-3 sm:max-w-lg">
        <Stat label="Дууссан ярилцлага" value={String(completed.length)} />
        <Stat label="Дундаж оноо" value={avg === null ? "—" : String(avg)} />
        <Stat label="Үргэлжилж буй" value={String(active.length)} />
      </div>

      {active.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">Үргэлжлүүлэх</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {active.slice(0, 4).map((s) => (
              <Card key={s.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.caseTitle}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(s.startedAt)} · {s.questionCount} асуулт
                  </p>
                </div>
                <Link href={`/interview/${s.id}`} className={buttonClass("secondary", "sm")}>
                  Үргэлжлүүлэх
                </Link>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Кейсүүд</h2>
        {cases.length === 0 ? (
          <EmptyState title="Нийтлэгдсэн кейс алга">Админ кейс нийтэлсний дараа энд харагдана.</EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cases.map((c) => {
              const attempts = completed.filter((s) => s.caseId === c.id);
              const best = attempts.length ? Math.max(...attempts.map((s) => s.totalScore ?? 0)) : null;
              // Continue an open interview instead of starting a parallel one.
              const open = active.find((s) => s.caseId === c.id);
              return (
                <Card key={c.id} className="flex flex-col p-5">
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <Badge tone="brand">{c.specialty}</Badge>
                    <Badge>{DIFFICULTY_LABELS[c.difficulty] ?? c.difficulty}</Badge>
                    {c.synthetic && <Badge tone="sky">Зохиомол</Badge>}
                  </div>
                  <h3 className="font-semibold leading-snug">{c.displayTitle.mn}</h3>
                  <dl className="mt-3 space-y-1 text-sm text-slate-600">
                    <div className="flex gap-2">
                      <dt className="text-slate-400">Өвчтөн:</dt>
                      <dd>
                        {c.patient.name}, {c.patient.age} нас, {SEX_LABELS[c.patient.sex]}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-slate-400">Зовиур:</dt>
                      <dd>{c.chiefComplaint.mn}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-slate-400">Орчин:</dt>
                      <dd>{c.setting.mn}</dd>
                    </div>
                  </dl>
                  <div className="mt-auto pt-5">
                    <p className="mb-3 text-xs text-slate-500">
                      ~{c.estimatedMinutes} минут
                      {best !== null && (
                        <>
                          {" "}
                          · Шилдэг оноо <span className={`font-semibold ${scoreTone(best).text}`}>{Math.round(best)}</span> ({attempts.length} оролдлого)
                        </>
                      )}
                    </p>
                    {open ? (
                      <Link href={`/interview/${open.id}`} className={buttonClass("primary", "md", "w-full")}>
                        Үргэлжлүүлэх
                      </Link>
                    ) : (
                      <StartCaseButton caseId={c.id} label={attempts.length ? "Дахин оролдох" : "Ярилцлага эхлэх"} />
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {news.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold">Сүүлийн мэдээ</h2>
            <Link href="/news" className="text-sm font-medium text-brand-700 hover:underline">
              Бүх мэдээ →
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {news.map((n) => (
              <Card key={n.id} className="p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{NEWS_CATEGORY_LABELS[n.category] ?? n.category}</Badge>
                  {n.publishedAt && <span className="text-xs text-slate-500">{formatDateTime(n.publishedAt)}</span>}
                </div>
                <Link href={`/news/${n.id}`} className="font-medium leading-snug hover:text-brand-700 hover:underline">
                  {n.title}
                </Link>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{n.summary}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <p className="mt-8 text-sm">
          <Link href="/sessions" className="font-medium text-brand-700 hover:underline">
            Бүх ярилцлагын түүхийг харах →
          </Link>
        </p>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold">{value}</p>
    </Card>
  );
}
