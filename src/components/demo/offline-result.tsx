"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { t } from "@/i18n";
import { loadOfflineResult } from "@/lib/demo/offline";
import { EvaluationReport } from "../feedback/evaluation-report";
import { EmptyState, Skeleton, buttonClass } from "../ui";

const noop = () => () => {};

export function OfflineResult({ caseId }: { caseId: string }) {
  // Read once on the client; the server renders the skeleton.
  const raw = useSyncExternalStore(
    noop,
    () => sessionStorage.getItem(`pq-offline-result:${caseId}`),
    () => undefined,
  );
  if (raw === undefined) return <Skeleton className="h-80 rounded-[2rem]" />;
  const data = raw ? loadOfflineResult(caseId) : null;
  if (!data) {
    return (
      <EmptyState
        title={t.feedback.noEvaluation}
        action={
          <Link href="/demo" className={buttonClass("primary")}>
            {t.demo.title}
          </Link>
        }
      />
    );
  }
  return (
    <EvaluationReport
      result={data.result}
      narrative={null}
      submittedReasoning={data.reasoning || null}
      confidenceKey={`offline-${caseId}`}
      messages={data.messages}
      patientName={data.patientName}
      casesHref="/demo"
    />
  );
}
