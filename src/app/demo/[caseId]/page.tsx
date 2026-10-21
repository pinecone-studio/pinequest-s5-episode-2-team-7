import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OfflineInterview } from "@/components/demo/offline-interview";
import { findOfflineCase } from "@/lib/demo/offline-cases";

export const metadata: Metadata = { title: "Офлайн демо" };

export default async function OfflineInterviewPage({ params }: PageProps<"/demo/[caseId]">) {
  const { caseId } = await params;
  if (!findOfflineCase(caseId)) notFound();
  return <OfflineInterview caseId={caseId} />;
}
