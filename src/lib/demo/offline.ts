/**
 * Offline demo backend: answers scripted questions and scores the interview
 * in the browser. Implements the same ConsultBackend as the real API so the
 * consultation screen is identical.
 */
import { t } from "@/i18n";
import { ClientApiError, type ConsultBackend } from "@/lib/api";
import type { ComponentScore, EvaluationResult, RubricResult } from "@/lib/evaluation/evaluator";
import type { MessageView, SessionView } from "@/lib/views";
import { findOfflineCase, type OfflineCase } from "./offline-cases";

interface OfflineState {
  messages: MessageView[];
  questions: { id: string; text: string; intents: string[] }[];
}

export interface OfflineResult {
  result: EvaluationResult;
  messages: MessageView[];
  reasoning: string;
  patientName: string;
}

const MAX_QUESTIONS = 30;
const PROVIDER = { label: t.consult.offlineBadge, isDemo: true };
const states = new Map<string, OfflineState>();
const resultKey = (caseId: string) => `pq-offline-result:${caseId}`;

const message = (role: MessageView["role"], content: string): MessageView => ({
  id: `${role}-${Math.random().toString(36).slice(2, 10)}`,
  role,
  content,
  createdAt: new Date().toISOString(),
});

function requireCase(caseId: string): OfflineCase {
  const c = findOfflineCase(caseId);
  if (!c) throw new Error(`Unknown offline case ${caseId}`);
  return c;
}

/** Starts a fresh offline interview and returns its session view. */
export function startOfflineSession(caseId: string): SessionView {
  const c = requireCase(caseId);
  const opening: MessageView = { id: `opening-${caseId}`, role: "patient", content: c.opening, createdAt: new Date().toISOString() };
  states.set(caseId, { messages: [opening], questions: [] });
  return {
    id: `offline-${caseId}`,
    status: "active",
    case: c.public,
    messages: [opening],
    questionCount: 0,
    maxQuestions: MAX_QUESTIONS,
    startedAt: new Date().toISOString(),
    endedAt: null,
    provider: PROVIDER,
    submission: null,
    evaluation: null,
  };
}

function state(caseId: string): OfflineState {
  let s = states.get(caseId);
  if (!s) {
    startOfflineSession(caseId);
    s = states.get(caseId)!;
  }
  return s;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function offlineBackend(caseId: string): ConsultBackend {
  const c = requireCase(caseId);
  return {
    async ask(content) {
      const s = state(caseId);
      const q = content.toLowerCase();
      const matched = c.intents.filter((intent) => intent.patterns.some((re) => re.test(q)));
      // Answer at most two topics per question, like the real disclosure engine.
      const spoken = matched.filter((i) => !i.narrator).slice(0, 2);
      const exam = matched.find((i) => i.narrator);
      const student = message("student", content);
      const replies: MessageView[] = [];
      if (exam) replies.push(message("narrator", exam.reply));
      if (spoken.length || !exam) replies.push(message("patient", spoken.length ? spoken.map((i) => i.reply).join(" ") : c.fallback));
      s.questions.push({ id: student.id, text: content, intents: matched.map((i) => i.id) });
      s.messages.push(student, ...replies);
      await wait(550 + Math.random() * 600);
      return { messages: [student, ...replies], questionCount: s.questions.length, provider: PROVIDER };
    },
    async submitDiagnosis({ diagnosis, reasoning }) {
      const s = state(caseId);
      const result = evaluateOffline(c, s.questions, diagnosis);
      const payload: OfflineResult = { result, messages: s.messages, reasoning, patientName: c.public.patient.name };
      try {
        sessionStorage.setItem(resultKey(caseId), JSON.stringify(payload));
      } catch {
        // The results page shows an empty state if storage is unavailable.
      }
      await wait(400);
    },
    async end() {
      states.delete(caseId);
    },
    async transcribe() {
      // No speech service offline.
      throw new ClientApiError(t.errors.sttUnavailable, 501, "stt_unavailable");
    },
    async replyAudio() {
      return null;
    },
    resultsHref: `/demo/${caseId}/result`,
    casesHref: "/demo",
  };
}

export function loadOfflineResult(caseId: string): OfflineResult | null {
  try {
    const raw = sessionStorage.getItem(resultKey(caseId));
    return raw ? (JSON.parse(raw) as OfflineResult) : null;
  } catch {
    return null;
  }
}

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const mentions = (text: string, aliases: string[]) => aliases.some((a) => text.includes(norm(a)));

function component(items: RubricResult[], weight: number): ComponentScore {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  const covered = items.filter((i) => i.covered).reduce((sum, i) => sum + i.weight, 0);
  const ratio = total ? covered / total : 1;
  return { ratio, weight, points: Math.round(ratio * weight * 1000) / 10, covered: items.filter((i) => i.covered).length, total: items.length };
}

export function evaluateOffline(c: OfflineCase, questions: OfflineState["questions"], diagnosis: string): EvaluationResult {
  const weights = { diagnosis: 0.4, history: 0.4, critical: 0.2 };
  const items: RubricResult[] = c.rubric.map((item) => {
    const evidence = questions.find((q) => q.intents.some((i) => item.intents.includes(i)));
    return {
      id: item.id,
      label: item.label,
      category: item.category,
      critical: item.critical,
      weight: item.weight,
      covered: !!evidence,
      evidence: evidence ? { messageId: evidence.id, text: evidence.text } : undefined,
      rationale: item.rationale,
      suggestedQuestion: item.suggestedQuestion,
    };
  });

  const candidates = diagnosis.split(/[,;/\n]| эсвэл | or /i).map(norm).filter(Boolean);
  const aliases = [...c.diagnosis.aliases, c.diagnosis.label, c.diagnosis.en];
  const correctAt = candidates.findIndex((cand) => mentions(cand, aliases));
  const differential = c.differentials.find((d) => candidates[0] && mentions(candidates[0], [...d.aliases, d.label]));
  const verdict = !candidates.length ? "empty" : correctAt === 0 ? "correct" : correctAt > 0 ? "partial" : differential ? "differential" : "incorrect";
  const score = verdict === "correct" ? 1 : verdict === "partial" ? 0.5 : 0;

  const diagnosisComponent: ComponentScore = { ratio: score, weight: weights.diagnosis, points: score * weights.diagnosis * 100, covered: score === 1 ? 1 : 0, total: 1 };
  const history = component(items.filter((i) => !i.critical), weights.history);
  const critical = component(items.filter((i) => i.critical), weights.critical);
  const askedIntents = new Set(questions.flatMap((q) => q.intents));
  const categories = [...new Set(items.map((i) => i.category))].map((category) => ({
    category,
    covered: items.filter((i) => i.category === category && i.covered).length,
    total: items.filter((i) => i.category === category).length,
  }));
  const texts = questions.map((q) => norm(q.text));

  return {
    version: "eval-v1",
    caseId: c.public.id,
    caseVersion: 1,
    weights,
    totalScore: Math.round((diagnosisComponent.points + history.points + critical.points) * 10) / 10,
    diagnosis: {
      verdict,
      score,
      fuzzy: false,
      notLeading: correctAt > 0,
      differential: differential?.label,
      submitted: diagnosis,
      expected: c.diagnosis.label,
      expectedEn: c.diagnosis.en,
      explanation: c.diagnosis.explanation,
    },
    components: { diagnosis: diagnosisComponent, history, critical },
    items,
    categories,
    discoveredFindings: c.findings.filter((f) => askedIntents.has(f.intent)).map((f) => ({ factId: f.intent, text: f.text, significance: f.significance })),
    missedFindings: c.findings.filter((f) => !askedIntents.has(f.intent)).map((f) => ({ factId: f.intent, text: f.text, significance: f.significance })),
    questionStats: {
      total: questions.length,
      clinical: questions.filter((q) => q.intents.some((i) => i !== "greeting")).length,
      repeated: texts.length - new Set(texts).size,
      unclear: questions.filter((q) => !q.intents.length).length,
      diagnosisRequests: 0,
    },
    learningPoints: c.learningPoints,
    differentials: c.differentials.map((d) => ({ label: d.label, rationale: d.rationale })),
    emergencyNote: c.emergencyNote,
    summary: c.summary,
  };
}
