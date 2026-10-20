import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError, Errors } from "@/lib/api/http";
import type { SessionData } from "@/lib/auth/session";
import { toPublicCase } from "@/lib/cases/public";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { cases, diagnosisSubmissions, disclosedFacts, evaluations, interviewSessions, messages, users, type MessageRow, type SessionRow } from "@/lib/db/schema";
import { evaluateInterview } from "@/lib/evaluation/evaluator";
import type { TranscriptTurn } from "@/lib/patient/context";
import { getPatientProvider } from "@/lib/patient/providers";
import type { ProviderId } from "@/lib/patient/providers/types";
import { openingMessage, simulateTurn, SimulatorError } from "@/lib/patient/simulator";
import type { TopicId } from "@/lib/patient/topics";
import { checkRateLimit } from "@/lib/rate-limit";
import type { EvaluationView, MessageView, ProviderBadge, SessionSummary, SessionView } from "@/lib/views";
import { generateFeedbackNarrative } from "./narrative";

export const MAX_QUESTIONS_PER_SESSION = 60;
export const MAX_QUESTION_LENGTH = 500;

export const QuestionInput = z.object({
  content: z.string().trim().min(1, "Асуултаа бичнэ үү").max(MAX_QUESTION_LENGTH, `Асуулт ${MAX_QUESTION_LENGTH} тэмдэгтээс хэтрэхгүй`),
});

export const DiagnosisInput = z.object({
  diagnosis: z.string().trim().min(2, "Оношоо бичнэ үү").max(300),
  reasoning: z.string().trim().max(2000).optional().default(""),
});

const PROVIDER_LABELS: Record<ProviderId, string> = {
  mock: "Демо горим",
  gemini: "Gemini",
  anthropic: "Claude",
  openai_compatible: "Нээлттэй загвар",
  finetuned: "Fine-tuned загвар",
};

export function providerBadge(provider: string): ProviderBadge {
  return { label: PROVIDER_LABELS[provider as ProviderId] ?? provider, isDemo: provider === "mock" };
}

/**
 * Badge for the model that ACTUALLY produced the latest answer. If the
 * configured model failed and templates answered, say so — never show the
 * configured model's name for a fallback answer.
 */
export function answeringBadge(configured: string, last: { provider: string | null; fallbackUsed: boolean } | undefined): ProviderBadge {
  if (last?.fallbackUsed) {
    return { label: `Демо горим (${PROVIDER_LABELS[configured as ProviderId] ?? configured} хариулсангүй)`, isDemo: true };
  }
  return providerBadge(last?.provider ?? configured);
}

function messageView(row: MessageRow): MessageView {
  return { id: row.id, role: row.role, content: row.content, createdAt: row.createdAt.toISOString() };
}

/** Admin access to other users' data re-reads the role (the cookie may be up to 7 days old). */
async function isCurrentAdmin(auth: SessionData): Promise<boolean> {
  if (auth.role !== "admin") return false;
  const db = await getDb();
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, auth.userId));
  return row?.role === "admin";
}

async function loadOwnedSession(auth: SessionData, sessionId: string, opts: { allowAdmin?: boolean } = {}): Promise<SessionRow> {
  if (!z.string().uuid().safeParse(sessionId).success) throw Errors.notFound("Ярилцлага");
  const db = await getDb();
  const [row] = await db.select().from(interviewSessions).where(eq(interviewSessions.id, sessionId));
  if (!row) throw Errors.notFound("Ярилцлага");
  const isOwner = row.userId === auth.userId;
  if (!isOwner && !(opts.allowAdmin && (await isCurrentAdmin(auth)))) throw Errors.notFound("Ярилцлага");
  return row;
}

export async function startSession(auth: SessionData, caseId: string): Promise<{ sessionId: string }> {
  const db = await getDb();
  const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId));
  if (!caseRow || caseRow.status !== "published") throw Errors.notFound("Кейс");
  const provider = getPatientProvider();
  const snapshot = caseRow.data;

  const sessionId = await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(interviewSessions)
      .values({
        userId: auth.userId,
        caseId: caseRow.id,
        caseVersion: caseRow.version,
        caseSnapshot: snapshot,
        provider: provider.id,
        model: provider.model,
      })
      .returning({ id: interviewSessions.id });
    await tx.insert(messages).values({ sessionId: session.id, seq: 0, role: "patient", content: openingMessage(snapshot), provider: "case", model: "opening-line" });
    return session.id;
  });
  return { sessionId };
}

export interface QuestionResult {
  messages: MessageView[];
  questionCount: number;
  provider: ProviderBadge;
}

export async function askQuestion(auth: SessionData, sessionId: string, content: string): Promise<QuestionResult> {
  const config = getConfig();
  const limit = checkRateLimit(`question:${auth.userId}`, config.RATE_LIMIT_MESSAGES_PER_MINUTE);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);

  const session = await loadOwnedSession(auth, sessionId);
  if (session.status !== "active") throw Errors.conflict("Энэ ярилцлага дууссан байна.");
  if (session.questionCount >= MAX_QUESTIONS_PER_SESSION) {
    throw Errors.conflict(`Нэг ярилцлагад ${MAX_QUESTIONS_PER_SESSION}-аас олон асуулт асуух боломжгүй. Оношоо илгээнэ үү.`);
  }

  const db = await getDb();
  const rows = await db.select().from(messages).where(eq(messages.sessionId, session.id)).orderBy(asc(messages.seq));
  const facts = await db.select({ factId: disclosedFacts.factId }).from(disclosedFacts).where(eq(disclosedFacts.sessionId, session.id));
  const disclosed = new Set(facts.map((f) => f.factId));
  const history: TranscriptTurn[] = rows
    .filter((r) => r.seq > 0 && r.role !== "narrator")
    .map((r) => ({ role: r.role === "student" ? "student" : "patient", text: r.content }));

  let turn;
  try {
    turn = await simulateTurn(
      { patientCase: session.caseSnapshot, question: content, disclosedFactIds: disclosed, history, turnIndex: session.questionCount },
      { provider: getPatientProvider(), fallback: config.PATIENT_FALLBACK_PROVIDER, intentMode: config.INTENT_CLASSIFIER, timeoutMs: config.PROVIDER_TIMEOUT_MS },
    );
  } catch (error) {
    if (error instanceof SimulatorError) {
      throw new ApiError(503, "provider_unavailable", "Өвчтөний AI загвар одоогоор хариу өгөхгүй байна. Түр хүлээгээд дахин оролдоно уу.");
    }
    throw error;
  }

  const nextSeq = (rows.at(-1)?.seq ?? 0) + 1;
  try {
    const inserted = await db.transaction(async (tx) => {
      const [student] = await tx
        .insert(messages)
        .values({
          sessionId: session.id,
          seq: nextSeq,
          role: "student",
          content,
          topics: turn.classification.topics,
          mode: turn.plan.mode,
          classifierSource: turn.classification.source,
        })
        .returning();
      const [patient] = await tx
        .insert(messages)
        .values({
          sessionId: session.id,
          seq: nextSeq + 1,
          role: "patient",
          content: turn.patientText,
          disclosedFactIds: turn.plan.newlyDisclosedIds.filter((id) => turn.plan.facts.some((f) => f.id === id)),
          provider: turn.provider,
          model: turn.model,
          fallbackUsed: turn.fallbackUsed,
          fallbackReason: turn.fallbackReason ?? null,
          validationIssues: turn.validationIssues,
        })
        .returning();
      const created = [student, patient];
      let anchor = patient;
      if (turn.narratorText) {
        const [narrator] = await tx
          .insert(messages)
          .values({
            sessionId: session.id,
            seq: nextSeq + 2,
            role: "narrator",
            content: turn.narratorText,
            disclosedFactIds: turn.plan.narratorFacts.map((f) => f.id),
            provider: "narrator",
            model: "case-data",
          })
          .returning();
        created.push(narrator);
        anchor = narrator;
      }
      if (turn.plan.newlyDisclosedIds.length > 0) {
        await tx
          .insert(disclosedFacts)
          .values(turn.plan.newlyDisclosedIds.map((factId) => ({ sessionId: session.id, factId, messageId: turn.plan.facts.some((f) => f.id === factId) ? patient.id : anchor.id })))
          .onConflictDoNothing();
      }
      await tx
        .update(interviewSessions)
        .set({ questionCount: sql`${interviewSessions.questionCount} + 1` })
        .where(eq(interviewSessions.id, session.id));
      return created;
    });
    return {
      messages: inserted.map(messageView),
      questionCount: session.questionCount + 1,
      provider: answeringBadge(session.provider, { provider: turn.provider, fallbackUsed: turn.fallbackUsed }),
    };
  } catch (error) {
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      throw Errors.conflict("Өмнөх асуултын хариу боловсруулагдаж байна. Түр хүлээнэ үү.");
    }
    throw error;
  }
}

export async function submitDiagnosis(auth: SessionData, sessionId: string, input: z.infer<typeof DiagnosisInput>): Promise<EvaluationView> {
  const session = await loadOwnedSession(auth, sessionId);
  if (session.status !== "active") throw Errors.conflict("Энэ ярилцлагад онош аль хэдийн илгээгдсэн эсвэл дууссан байна.");
  const db = await getDb();
  const rows = await db.select().from(messages).where(eq(messages.sessionId, session.id)).orderBy(asc(messages.seq));
  const facts = await db.select({ factId: disclosedFacts.factId }).from(disclosedFacts).where(eq(disclosedFacts.sessionId, session.id));

  const result = evaluateInterview({
    patientCase: session.caseSnapshot,
    questions: rows
      .filter((r) => r.role === "student")
      .map((r) => ({ messageId: r.id, text: r.content, topics: r.topics as TopicId[], mode: r.mode ?? undefined })),
    disclosedFactIds: new Set(facts.map((f) => f.factId)),
    diagnosisText: input.diagnosis,
    reasoning: input.reasoning,
  });

  const evaluation = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(interviewSessions)
      .set({ status: "completed", endedAt: new Date() })
      .where(and(eq(interviewSessions.id, session.id), eq(interviewSessions.status, "active")))
      .returning({ id: interviewSessions.id });
    if (!updated) throw Errors.conflict("Энэ ярилцлагад онош аль хэдийн илгээгдсэн байна.");
    const [submission] = await tx
      .insert(diagnosisSubmissions)
      .values({ sessionId: session.id, diagnosis: input.diagnosis, reasoning: input.reasoning || null })
      .returning();
    const [row] = await tx
      .insert(evaluations)
      .values({
        sessionId: session.id,
        submissionId: submission.id,
        evaluatorVersion: result.version,
        totalScore: result.totalScore,
        diagnosisVerdict: result.diagnosis.verdict,
        result,
      })
      .returning();
    return row;
  });

  // Optional prose. Failure never affects the stored, deterministic score.
  const narrative = await generateFeedbackNarrative(result, input.reasoning).catch(() => null);
  if (narrative) {
    await db.update(evaluations).set({ narrative: narrative.text, narrativeProvider: narrative.provider }).where(eq(evaluations.id, evaluation.id));
  }
  return { result, narrative: narrative?.text ?? null, createdAt: evaluation.createdAt.toISOString() };
}

export async function abandonSession(auth: SessionData, sessionId: string): Promise<void> {
  const session = await loadOwnedSession(auth, sessionId);
  if (session.status !== "active") return;
  const db = await getDb();
  await db.update(interviewSessions).set({ status: "abandoned", endedAt: new Date() }).where(eq(interviewSessions.id, session.id));
}

export async function getSessionView(auth: SessionData, sessionId: string): Promise<SessionView> {
  const session = await loadOwnedSession(auth, sessionId, { allowAdmin: true });
  const db = await getDb();
  const rows = await db.select().from(messages).where(eq(messages.sessionId, session.id)).orderBy(asc(messages.seq));
  const [submission] = await db.select().from(diagnosisSubmissions).where(eq(diagnosisSubmissions.sessionId, session.id));
  const [evaluation] = session.status === "completed" ? await db.select().from(evaluations).where(eq(evaluations.sessionId, session.id)) : [];

  return {
    id: session.id,
    status: session.status,
    case: toPublicCase(session.caseSnapshot),
    messages: rows.map(messageView),
    questionCount: session.questionCount,
    maxQuestions: MAX_QUESTIONS_PER_SESSION,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    provider: answeringBadge(
      session.provider,
      rows.filter((r) => r.role === "patient" && r.seq > 0).at(-1),
    ),
    submission: submission ? { diagnosis: submission.diagnosis, reasoning: submission.reasoning } : null,
    evaluation: evaluation ? { result: evaluation.result, narrative: evaluation.narrative, createdAt: evaluation.createdAt.toISOString() } : null,
  };
}

export async function listSessions(auth: SessionData, opts: { all?: boolean; limit?: number } = {}): Promise<SessionSummary[]> {
  const db = await getDb();
  const base = db
    .select({
      id: interviewSessions.id,
      caseId: interviewSessions.caseId,
      snapshot: interviewSessions.caseSnapshot,
      status: interviewSessions.status,
      questionCount: interviewSessions.questionCount,
      startedAt: interviewSessions.startedAt,
      endedAt: interviewSessions.endedAt,
      totalScore: evaluations.totalScore,
      diagnosisVerdict: evaluations.diagnosisVerdict,
    })
    .from(interviewSessions)
    .leftJoin(evaluations, eq(evaluations.sessionId, interviewSessions.id));
  const all = opts.all && (await isCurrentAdmin(auth));
  const rows = await (all ? base : base.where(eq(interviewSessions.userId, auth.userId)))
    .orderBy(desc(interviewSessions.startedAt))
    .limit(opts.limit ?? 100);
  return rows.map((r) => ({
    id: r.id,
    caseId: r.caseId,
    caseTitle: r.snapshot.public.displayTitle.mn,
    specialty: r.snapshot.public.specialty,
    status: r.status,
    questionCount: r.questionCount,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
    totalScore: r.totalScore,
    diagnosisVerdict: r.diagnosisVerdict,
  }));
}

/** Admin-only: full message rows with classifier/provider metadata. */
export async function getSessionAudit(sessionIds: string[]) {
  if (sessionIds.length === 0) return [];
  const db = await getDb();
  return db.select().from(messages).where(inArray(messages.sessionId, sessionIds)).orderBy(asc(messages.sessionId), asc(messages.seq));
}
