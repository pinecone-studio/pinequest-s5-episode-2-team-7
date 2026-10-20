import type { Metadata } from "next";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { providerDiagnostics } from "@/lib/services/diagnostics";

export const metadata: Metadata = { title: "Админ — AI загварын төлөв" };

export default async function DiagnosticsPage() {
  const d = await providerDiagnostics();
  const totalAnswers = d.recentAnswers.reduce((sum, r) => sum + r.count, 0);
  const fallbacks = d.recentAnswers.filter((r) => r.fallback).reduce((sum, r) => sum + r.count, 0);

  return (
    <main className="space-y-6">
      <PageHeader title="AI загварын төлөв" subtitle="Идэвхтэй provider, загварын хувилбар, эрүүл мэндийн шалгалт. API түлхүүр хэзээ ч харагдахгүй." />
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Тохиргоо</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="PATIENT_PROVIDER" value={d.configured.provider} />
          <Row label="PATIENT_FALLBACK_PROVIDER" value={d.configured.fallback} />
          <Row label="INTENT_CLASSIFIER" value={d.configured.intentClassifier} />
          <Row label="FEEDBACK_NARRATIVE" value={d.configured.feedbackNarrative} />
          <Row label="Өгөгдлийн сан" value={d.configured.database === "postgres" ? "PostgreSQL" : "PGlite (локал)"} />
        </dl>
      </Card>
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-semibold">Эрүүл мэндийн шалгалт</h2>
          <Badge tone={d.health.ok ? "emerald" : "rose"}>{d.health.ok ? "OK" : "Алдаа"}</Badge>
        </div>
        {"model" in d.health ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Row label="Provider" value={d.health.provider} />
            <Row label="Загвар" value={d.health.model} />
            {d.health.adapter && <Row label="Adapter" value={d.health.adapter} />}
            {d.health.latencyMs !== undefined && <Row label="Хоцрол" value={`${d.health.latencyMs} мс`} />}
            <Row label="Тайлбар" value={d.health.detail} />
          </dl>
        ) : (
          <Alert>{d.health.detail}</Alert>
        )}
        {d.configured.provider === "finetuned" && !d.health.ok && (
          <p className="mt-3 text-sm text-rose-700">
            Fine-tuned загвар баталгаажаагүй тул хариултыг «fine-tuned» гэж тэмдэглэхгүй. Нөөц горим идэвхтэй бол загвар текстээр хариулна.
          </p>
        )}
      </Card>
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">Сүүлийн 24 цагийн хариултууд</h2>
        <p className="mb-3 text-xs text-slate-500">
          Нийт {totalAnswers} · нөөц горимоор {fallbacks}. Хариулт бүрт бодитоор хариулсан provider хадгалагддаг.
        </p>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th className="py-1 font-medium">Provider</th>
              <th className="py-1 font-medium">Загвар</th>
              <th className="py-1 font-medium">Нөөц</th>
              <th className="py-1 text-right font-medium">Тоо</th>
            </tr>
          </thead>
          <tbody>
            {d.recentAnswers.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1.5">{r.provider}</td>
                <td className="py-1.5 font-mono text-xs">{r.model}</td>
                <td className="py-1.5">{r.fallback ? <Badge tone="amber">тийм</Badge> : "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{value}</dd>
    </div>
  );
}
