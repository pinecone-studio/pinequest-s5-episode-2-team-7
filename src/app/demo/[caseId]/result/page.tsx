import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OfflineResult } from "@/components/demo/offline-result";
import { PageHeader } from "@/components/ui";
import { t } from "@/i18n";
import { findOfflineCase } from "@/lib/demo/offline-cases";

export const metadata: Metadata = { title: "Демо үнэлгээ" };

export default async function OfflineResultPage({ params }: PageProps<"/demo/[caseId]/result">) {
  const { caseId } = await params;
  const c = findOfflineCase(caseId);
  if (!c) notFound();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <PageHeader title={c.public.displayTitle.mn} subtitle={t.demo.banner} />
      <OfflineResult caseId={caseId} />
    </main>
  );
}
