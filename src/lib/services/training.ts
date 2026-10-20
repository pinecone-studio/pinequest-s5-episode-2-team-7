import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { Errors } from "@/lib/api/http";
import type { PatientCase } from "@/lib/cases/schema";
import { getDb } from "@/lib/db/client";
import { cases, interviewSessions, messages, trainingExamples, type TrainingTurn } from "@/lib/db/schema";

/**
 * Interview transcripts reviewed by an administrator can become training
 * data. Only answers that came from reviewed case wording (mock provider) or
 * passed validation are kept; fallback/validation-failed turns are dropped.
 */
export async function proposeSessionForTraining(sessionId: string, reviewerId: string, status: "approved" | "rejected", notes?: string) {
  const db = await getDb();
  const [session] = await db.select().from(interviewSessions).where(eq(interviewSessions.id, sessionId));
  if (!session) throw Errors.notFound("Ярилцлага");
  const [caseRow] = await db.select({ trainingUseAllowed: cases.trainingUseAllowed }).from(cases).where(eq(cases.id, session.caseId));
  if (status === "approved" && !caseRow?.trainingUseAllowed) {
    throw Errors.badRequest("Энэ кейсийн лиценз сургалтын өгөгдөлд ашиглахыг зөвшөөрөөгүй байна.");
  }

  const rows = await db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(asc(messages.seq));
  const turns: TrainingTurn[] = [];
  for (let i = 0; i < rows.length; i++) {
    const student = rows[i];
    const patient = rows[i + 1];
    if (student.role !== "student" || patient?.role !== "patient") continue;
    if (patient.validationIssues.length > 0) continue;
    turns.push({
      question: student.content,
      topics: student.topics,
      mode: student.mode,
      disclosedFactIds: patient.disclosedFactIds,
      answer: patient.content,
      provider: patient.provider,
    });
  }
  if (turns.length === 0) throw Errors.badRequest("Сургалтад ашиглах хүчинтэй асуулт-хариулт алга.");

  const values = { caseId: session.caseId, sessionId, source: "session" as const, status, data: turns, notes: notes ?? null, reviewedBy: reviewerId, reviewedAt: new Date() };
  const [row] = await db
    .insert(trainingExamples)
    .values(values)
    .onConflictDoUpdate({ target: trainingExamples.sessionId, set: { status, data: turns, notes: notes ?? null, reviewedBy: reviewerId, reviewedAt: new Date() } })
    .returning();
  return { id: row.id, status: row.status, turns: turns.length };
}

export async function listTrainingExamples() {
  const db = await getDb();
  const rows = await db.select().from(trainingExamples).orderBy(desc(trainingExamples.createdAt)).limit(500);
  return rows.map((r) => ({ id: r.id, caseId: r.caseId, sessionId: r.sessionId, status: r.status, turns: r.data.length, createdAt: r.createdAt.toISOString() }));
}

export interface TrainingExportRecord {
  id: string;
  caseId: string;
  caseVersion: number;
  source: "session" | "synthetic";
  /** Private case snapshot — the pipeline needs it to rebuild restricted prompts. */
  case: PatientCase;
  turns: TrainingTurn[];
}

/** Approved transcripts as JSONL records for `ml/` (admin-only download). */
export async function exportApprovedTraining(): Promise<TrainingExportRecord[]> {
  const db = await getDb();
  const rows = await db
    .select({ example: trainingExamples, snapshot: interviewSessions.caseSnapshot, caseVersion: interviewSessions.caseVersion })
    .from(trainingExamples)
    .innerJoin(interviewSessions, eq(interviewSessions.id, trainingExamples.sessionId))
    .where(and(eq(trainingExamples.status, "approved")));
  return rows.map((r) => ({
    id: r.example.id,
    caseId: r.example.caseId,
    caseVersion: r.caseVersion,
    source: r.example.source,
    case: r.snapshot,
    turns: r.example.data,
  }));
}
