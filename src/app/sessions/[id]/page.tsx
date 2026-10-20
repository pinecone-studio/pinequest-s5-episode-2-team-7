import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TrainingReviewButtons } from "@/components/admin/training-review-buttons";
import { EvaluationReport } from "@/components/feedback/evaluation-report";
import { Alert, Badge, buttonClass, Card, PageHeader, cn } from "@/components/ui";
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
            {formatDateTime(view.startedAt)} · {view.questionCount} асуулт · {SESSION_STATUS_LABELS[view.status]}
          </>
        }
        actions={
          <>
            <Link href="/dashboard" className={buttonClass("secondary", "sm")}>
              Кейсүүд рүү
            </Link>
            <Link href="/sessions" className={buttonClass("ghost", "sm")}>
              Түүх
            </Link>
          </>
        }
      />

      {auth.role === "admin" && view.status === "completed" && (
        <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Админ:</span> энэ ярилцлагын асуулт-хариултыг fine-tuning өгөгдөлд оруулах уу?
          </p>
          <TrainingReviewButtons sessionId={view.id} />
        </Card>
      )}

      {view.evaluation ? (
        <EvaluationReport result={view.evaluation.result} narrative={view.evaluation.narrative} submittedReasoning={view.submission?.reasoning ?? null} />
      ) : (
        <Alert tone="amber" title="Үнэлгээ байхгүй">
          Энэ ярилцлагыг оношгүйгээр зогсоосон тул үнэлгээ хийгдээгүй.
        </Alert>
      )}

      <Card className="mt-6 p-6">
        <details>
          <summary className="cursor-pointer text-lg font-semibold">Ярилцлагын бүтэн тэмдэглэл ({view.messages.length})</summary>
          <ol className="mt-4 space-y-2 text-sm">
            {view.messages.map((m) => (
              <li
                key={m.id}
                className={cn(
                  "rounded-lg px-3 py-2",
                  m.role === "student" && "bg-brand-50",
                  m.role === "patient" && "bg-slate-50",
                  m.role === "narrator" && "border border-sky-100 bg-sky-50",
                )}
              >
                <Badge tone={m.role === "student" ? "brand" : m.role === "narrator" ? "sky" : "slate"} className="mr-2">
                  {m.role === "student" ? "Та" : m.role === "narrator" ? "Үзлэг" : view.case.patient.name}
                </Badge>
                <span className="prose-mn whitespace-pre-line">{m.content}</span>
              </li>
            ))}
          </ol>
        </details>
      </Card>
    </main>
  );
}
