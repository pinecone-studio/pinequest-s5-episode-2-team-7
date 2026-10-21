import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TrainingReviewButtons } from "@/components/admin/training-review-buttons";
import { EvaluationReport } from "@/components/feedback/evaluation-report";
import { Alert, buttonClass, Card, PageHeader } from "@/components/ui";
import { t } from "@/i18n";
import { ApiError } from "@/lib/api/http";
import { requirePageUser } from "@/lib/auth/server";
import { SESSION_STATUS_LABELS, formatDateTime } from "@/lib/i18n";
import { getSessionView } from "@/lib/services/sessions";

export const metadata: Metadata = { title: "Үнэлгээ" };

export default async function SessionResultPage({ params }: PageProps<"/sessions/[id]">) {
  const { id } = await params;
  const auth = await requirePageUser(`/sessions/${id}`);
  let view;
  try {
    view = await getSessionView(auth, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  if (view.status === "active" && auth.role !== "admin") redirect(`/interview/${id}`);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <PageHeader
        title={view.case.displayTitle.mn}
        subtitle={
          <>
            {formatDateTime(view.startedAt)} · {t.cases.questions(view.questionCount)} · {SESSION_STATUS_LABELS[view.status]}
          </>
        }
        actions={
          <Link href="/sessions" className={buttonClass("ghost", "sm")}>
            {t.nav.history}
          </Link>
        }
      />

      {auth.role === "admin" && view.status === "completed" && (
        <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">Админ:</span> энэ ярилцлагын асуулт-хариултыг fine-tuning өгөгдөлд оруулах уу?
          </p>
          <TrainingReviewButtons sessionId={view.id} />
        </Card>
      )}

      {view.evaluation ? (
        <EvaluationReport
          result={view.evaluation.result}
          narrative={view.evaluation.narrative}
          submittedReasoning={view.submission?.reasoning ?? null}
          confidenceKey={view.id}
          messages={view.messages}
          patientName={view.case.patient.name}
          casesHref="/dashboard"
        />
      ) : (
        <Alert tone="amber">{t.feedback.noEvaluation}</Alert>
      )}
    </main>
  );
}
