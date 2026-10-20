import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { qualityReport } from "@/lib/services/quality";
import { requirePageAdmin } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Админ — Өгөгдлийн чанар" };

export default async function QualityPage() {
  await requirePageAdmin("/admin/quality");
  const report = await qualityReport();
  const byCase = new Map<string, typeof report.issues>();
  for (const issue of report.issues) byCase.set(issue.caseId, [...(byCase.get(issue.caseId) ?? []), issue]);

  return (
    <main className="space-y-6">
      <PageHeader title="Өгөгдлийн чанар" subtitle="Бүтцийн алдаа, хяналтын төлөв, лиценз, орчуулга, LLM-ийн нууц задралаас хамгаалах тохиргоо." />
      <div className="grid grid-cols-3 gap-3 sm:max-w-md">
        <Card className="px-4 py-3">
          <p className="text-xs text-slate-500">Кейс</p>
          <p className="text-xl font-semibold">{report.cases}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs text-slate-500">Алдаа</p>
          <p className="text-xl font-semibold text-rose-700">{report.errors}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs text-slate-500">Анхааруулга</p>
          <p className="text-xl font-semibold text-amber-700">{report.warnings}</p>
        </Card>
      </div>
      {[...byCase.entries()].map(([caseId, issues]) => (
        <Card key={caseId} className="p-4">
          <Link href={`/admin/cases/${caseId}`} className="font-mono text-sm font-medium text-brand-700 hover:underline">
            {caseId}
          </Link>
          <ul className="mt-2 space-y-1.5 text-sm">
            {issues.map((i, idx) => (
              <li key={idx} className="flex gap-2">
                <Badge tone={i.severity === "error" ? "rose" : i.severity === "warning" ? "amber" : "slate"}>{i.severity}</Badge>
                <span className="text-slate-700">{i.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </main>
  );
}
