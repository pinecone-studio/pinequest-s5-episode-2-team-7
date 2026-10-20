import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaseEditor } from "@/components/admin/case-editor";
import { CaseStatusSelect } from "@/components/admin/case-status-select";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ApiError } from "@/lib/api/http";
import { getTopic } from "@/lib/patient/topics";
import { getCaseAdmin } from "@/lib/services/cases";

export const metadata: Metadata = { title: "Админ — Кейс засах" };

export default async function AdminCasePage({ params }: PageProps<"/admin/cases/[id]">) {
  const { id } = await params;
  let record;
  try {
    record = await getCaseAdmin(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const { summary, data } = record;

  return (
    <main>
      <PageHeader
        title={summary.title}
        subtitle={
          <>
            {summary.internalTitle} · <code>{summary.id}</code> · v{summary.version}
          </>
        }
        actions={<CaseStatusSelect caseId={summary.id} status={summary.status} />}
      />
      <Card className="mb-6 overflow-x-auto p-4">
        <p className="mb-3 text-sm font-semibold">
          Нууц баримтууд ({data.hidden.facts.length}) — онош: <span className="text-brand-700">{data.hidden.diagnosis.label.mn}</span>
        </p>
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className="py-1 pr-3 font-medium">id</th>
              <th className="py-1 pr-3 font-medium">Төрөл</th>
              <th className="py-1 pr-3 font-medium">Сэдэв</th>
              <th className="py-1 font-medium">Хариулт</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.hidden.facts.map((f) => (
              <tr key={f.id} className="align-top">
                <td className="py-1.5 pr-3 font-mono">{f.id}</td>
                <td className="py-1.5 pr-3">
                  <Badge tone={f.patientKnows ? "slate" : "sky"}>{f.kind}</Badge>
                </td>
                <td className="py-1.5 pr-3 text-slate-500">{f.topics.map((t) => getTopic(t)?.label.mn ?? t).join(", ")}</td>
                <td className="py-1.5 text-slate-700">{f.answer.mn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <CaseEditor mode="edit" caseId={summary.id} initialJson={JSON.stringify(data, null, 2)} />
    </main>
  );
}
