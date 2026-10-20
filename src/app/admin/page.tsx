import type { Metadata } from "next";
import Link from "next/link";
import { CaseStatusSelect } from "@/components/admin/case-status-select";
import { Badge, buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { DIFFICULTY_LABELS, formatDateTime } from "@/lib/i18n";
import { listAllCases } from "@/lib/services/cases";
import { requirePageAdmin } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Админ — Кейсүүд" };

export default async function AdminCasesPage() {
  await requirePageAdmin("/admin");
  const cases = await listAllCases();
  return (
    <main>
      <PageHeader
        title="Кейсийн удирдлага"
        subtitle="Зөвхөн нийтлэгдсэн (published) кейс оюутанд харагдана. Онош, рубрик хэзээ ч оюутанд илгээгдэхгүй."
        actions={
          <Link href="/admin/cases/new" className={buttonClass("primary", "sm")}>
            Шинэ кейс
          </Link>
        }
      />
      {cases.length === 0 ? (
        <EmptyState title="Кейс алга">`npm run db:seed` ажиллуулж демо кейс нэмэх эсвэл JSON импортлоно уу.</EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Кейс</th>
                <th className="px-4 py-3 font-medium">Сэдэв</th>
                <th className="px-4 py-3 font-medium">Эх сурвалж / хяналт</th>
                <th className="px-4 py-3 font-medium">Төлөв</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cases.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.title}</p>
                    <p className="text-xs text-slate-500">{c.internalTitle}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-400">
                      {c.id} · v{c.version} · {formatDateTime(c.updatedAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{c.specialty}</p>
                    <p className="text-xs text-slate-500">{DIFFICULTY_LABELS[c.difficulty] ?? c.difficulty}</p>
                  </td>
                  <td className="space-x-1 space-y-1 px-4 py-3">
                    <Badge tone={c.synthetic ? "sky" : "slate"}>{c.source}</Badge>
                    <Badge tone={c.reviewStatus === "reviewed" ? "emerald" : "amber"}>{c.reviewStatus === "reviewed" ? "Хянасан" : "Хянаагүй"}</Badge>
                    {!c.trainingUseAllowed && <Badge tone="rose">Сургалтад хориотой</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <CaseStatusSelect caseId={c.id} status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/cases/${c.id}`} className={buttonClass("secondary", "sm")}>
                      Засах
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </main>
  );
}
