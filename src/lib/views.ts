/**
 * Data shapes sent to the browser. Safe to import from client components.
 * Nothing here may contain hidden case data before evaluation.
 */
import type { PublicCase } from "@/lib/cases/public";
import type { EvaluationResult } from "@/lib/evaluation/evaluator";

export type { PublicCase };

/** Optional voice features available for an interview (see lib/speech/features). */
export interface VoiceFeatures {
  /** Student can ask by voice (Chimege STT). */
  speechInput: boolean;
  /** Patient replies can be spoken (Chimege TTS). */
  speechOutput: boolean;
  /** A talking video avatar is available for this patient. */
  avatar: boolean;
  /** Which service renders it (decides the client component). */
  avatarProvider: "simli" | "anam";
}

export interface MessageView {
  id: string;
  role: "student" | "patient" | "narrator";
  content: string;
  createdAt: string;
}

export type SessionStatus = "active" | "completed" | "abandoned";

export interface ProviderBadge {
  /** e.g. "Демо горим", "Gemini", "Fine-tuned загвар" */
  label: string;
  isDemo: boolean;
}

export interface SessionView {
  id: string;
  status: SessionStatus;
  case: PublicCase;
  messages: MessageView[];
  questionCount: number;
  maxQuestions: number;
  startedAt: string;
  endedAt: string | null;
  provider: ProviderBadge;
  submission: { diagnosis: string; reasoning: string | null } | null;
  /** Present only after the interview has been evaluated. */
  evaluation: EvaluationView | null;
}

export interface EvaluationView {
  result: EvaluationResult;
  narrative: string | null;
  createdAt: string;
}

export interface SessionSummary {
  id: string;
  caseId: string;
  caseTitle: string;
  specialty: string;
  status: SessionStatus;
  questionCount: number;
  startedAt: string;
  endedAt: string | null;
  totalScore: number | null;
  diagnosisVerdict: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
