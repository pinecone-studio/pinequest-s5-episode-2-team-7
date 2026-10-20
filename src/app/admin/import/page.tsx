import type { Metadata } from "next";
import { ImportForm } from "@/components/admin/import-form";
import { Card, PageHeader } from "@/components/ui";
import { requirePageAdmin } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Админ — Импорт / Экспорт" };

export default async function ImportExportPage() {
  await requirePageAdmin("/admin/import");
  return (
    <main className="space-y-6">
      <PageHeader title="Импорт / Экспорт" subtitle="Кейс бүрийг тусад нь шалгана. Алдаатай кейс бусдыг хаахгүй, импортолсон кейс ноорог төлөвтэй орно." />
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Кейс импортлох (JSON)</h2>
        <ImportForm />
        <p className="mt-4 text-xs text-slate-500">
          Кейс нь олон түвшний бүтэцтэй тул CSV-г дэмжихгүй. Гадаад эх сурвалжийн (AgentClinic гэх мэт) өгөгдлийг <code>ml/</code> доорх адаптераар
          каноник JSON болгож хөрвүүлээд энд импортлоно.
        </p>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Экспорт</h2>
        <ul className="space-y-2 text-sm">
          <li>
            <a className="font-medium text-brand-700 hover:underline" href="/api/admin/cases/export" download>
              Бүх кейс (JSON)
            </a>
          </li>
          <li>
            <a className="font-medium text-brand-700 hover:underline" href="/api/admin/cases/export?status=published" download>
              Нийтлэгдсэн кейс (JSON)
            </a>
          </li>
          <li>
            <a className="font-medium text-brand-700 hover:underline" href="/api/admin/training/export" download>
              Зөвшөөрсөн сургалтын ярилцлагууд (JSONL)
            </a>{" "}
            <span className="text-slate-500">— fine-tuning шугамын оролт</span>
          </li>
        </ul>
      </Card>
    </main>
  );
}
