import type { Metadata } from "next";
import { CaseEditor } from "@/components/admin/case-editor";
import { PageHeader } from "@/components/ui";
import { loadDemoCase } from "@/lib/cases/demo";

export const metadata: Metadata = { title: "Админ — Шинэ кейс" };

export default function NewCasePage() {
  // Start from a valid demo case as a template; the author changes id and content.
  const template = { ...loadDemoCase("chest-pain-01"), id: "new-case-01", version: 1 };
  return (
    <main>
      <PageHeader
        title="Шинэ кейс"
        subtitle="Жишээ кейсийг загвар болгон ачааллаа. id, нийтэд харагдах гарчиг (оношийг илчлэхгүй), баримт, рубрик, эх сурвалжийг өөрчилнө үү."
      />
      <CaseEditor mode="create" initialJson={JSON.stringify(template, null, 2)} />
    </main>
  );
}
