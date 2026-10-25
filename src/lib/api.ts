/**
 * Every call the student UI makes to the backend, in one place. The request
 * and response shapes are the server's contract (src/app/api/**) — change
 * them here, not in components.
 */
import { t } from "@/i18n";
import { ClientApiError, apiFetch } from "./fetcher";
import type { EvaluationView, MessageView, ProviderBadge, PublicCase, SessionView } from "./views";

export { ClientApiError };

export interface AskResult {
  messages: MessageView[];
  questionCount: number;
  provider: ProviderBadge;
}

export interface DiagnosisPayload {
  diagnosis: string;
  reasoning: string;
}

/** What the consultation screen needs from a backend (real API or offline demo). */
export interface ConsultBackend {
  ask(content: string): Promise<AskResult>;
  submitDiagnosis(input: DiagnosisPayload): Promise<void>;
  end(): Promise<void>;
  /** 16 kHz mono WAV → recognised Mongolian text. */
  transcribe(wav: Blob): Promise<string>;
  /** Spoken patient reply, or null when speech output is not available. */
  replyAudio(messageId: string): Promise<Blob | null>;
  /** Where to go after the diagnosis is submitted / the interview is ended. */
  resultsHref: string;
  casesHref: string;
}

/**
 * Retries a call that failed for a passing reason (no network, server error,
 * rate limit); a 4xx answer is final. Waits `delays` ms between attempts.
 */
export async function withRetry<T>(fn: () => Promise<T>, delays: number[] = [500, 1500]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const passing = !(error instanceof ClientApiError) || error.status === 0 || error.status === 429 || error.status >= 500;
      if (!passing || attempt >= delays.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

export const api = {
  /** Signs in as a guest unless already signed in (practice flow, no account needed). */
  ensureGuest: () => apiFetch<{ user: { id: string; name: string }; guest: boolean }>("/api/auth/guest", { method: "POST" }),
  listCases: () => apiFetch<{ cases: PublicCase[] }>("/api/cases").then((r) => r.cases),
  startSession: (caseId: string) => apiFetch<{ sessionId: string }>("/api/sessions", { method: "POST", json: { caseId } }).then((r) => r.sessionId),
  getSession: (id: string) => apiFetch<{ session: SessionView }>(`/api/sessions/${id}`).then((r) => r.session),
  ask: (id: string, content: string) => apiFetch<AskResult>(`/api/sessions/${id}/messages`, { method: "POST", json: { content } }),
  submitDiagnosis: (id: string, input: DiagnosisPayload) =>
    apiFetch<{ evaluation: EvaluationView }>(`/api/sessions/${id}/diagnosis`, { method: "POST", json: input }).then((r) => r.evaluation),
  endSession: (id: string) => apiFetch<{ ok: true }>(`/api/sessions/${id}/end`, { method: "POST" }),

  /**
   * Speech-to-text. Matches the voice branch's `POST /api/speech/transcribe`
   * (body: 16 kHz mono WAV ≤ 15 s → `{ text }`). Until that endpoint is merged
   * the server answers 404 and the UI tells the student to type instead.
   */
  async transcribe(wav: Blob): Promise<string> {
    try {
      const { text } = await apiFetch<{ text: string }>("/api/speech/transcribe", { method: "POST", body: wav, headers: { "content-type": "audio/wav" } });
      return text;
    } catch (error) {
      if (error instanceof ClientApiError && (error.status === 404 || error.status === 405 || error.status === 501)) {
        throw new ClientApiError(t.errors.sttUnavailable, error.status, "stt_unavailable");
      }
      throw error;
    }
  },

  /** Spoken patient reply (voice branch: `GET /api/sessions/:id/messages/:messageId/audio`). */
  async replyAudio(sessionId: string, messageId: string): Promise<Blob | null> {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages/${messageId}/audio`);
      if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) return null;
      return await response.blob();
    } catch {
      return null;
    }
  },
};

export function sessionBackend(sessionId: string): ConsultBackend {
  return {
    ask: (content) => api.ask(sessionId, content),
    submitDiagnosis: async (input) => {
      await api.submitDiagnosis(sessionId, input);
    },
    end: async () => {
      await api.endSession(sessionId);
    },
    transcribe: (wav) => api.transcribe(wav),
    replyAudio: (messageId) => api.replyAudio(sessionId, messageId),
    resultsHref: `/sessions/${sessionId}`,
    casesHref: "/dashboard",
  };
}

/** A friendly Mongolian message for a failed call; `offline` suggests the offline demo. */
export function describeError(error: unknown): { message: string; offline: boolean } {
  if (error instanceof ClientApiError) {
    // Speech errors carry their own message; they say nothing about the patient model.
    if (error.code === "stt_unavailable" || error.code.startsWith("speech_")) return { message: error.message, offline: false };
    if (error.status === 0) return { message: t.errors.network, offline: true };
    if (error.status === 429) return { message: t.errors.rateLimited, offline: false };
    if (error.status >= 500) return { message: t.errors.modelOffline, offline: true };
    return { message: error.message, offline: false };
  }
  return { message: t.errors.generic, offline: false };
}
