import type { PatientTurnContext } from "../context";
import type { TopicId } from "../topics";

export type ProviderId = "mock" | "gemini" | "anthropic" | "openai_compatible" | "finetuned";

export interface ProviderHealth {
  ok: boolean;
  provider: ProviderId;
  model: string;
  detail: string;
  /** For the fine-tuned provider: adapter id reported by the inference service. */
  adapter?: string;
  latencyMs?: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderId,
    readonly kind: "config" | "network" | "rate_limit" | "bad_response" | "timeout" | "unverified_model",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface GenerateOptions {
  signal?: AbortSignal;
  /**
   * Called with the reply so far while it streams in (providers that cannot
   * stream call it once with the whole reply). Lets the first sentence be
   * checked and voiced before the model has finished.
   */
  onText?: (soFar: string) => void;
}

/**
 * Turns a restricted turn context into the patient's words. Providers never
 * receive the private case — only `PatientTurnContext`.
 */
export interface PatientProvider {
  readonly id: ProviderId;
  readonly model: string;
  /** Human-readable label for diagnostics (no secrets). */
  readonly label: string;
  generate(ctx: PatientTurnContext, options?: GenerateOptions): Promise<string>;
  health(): Promise<ProviderHealth>;
  /**
   * Optional: map a free-text question onto taxonomy topic ids when the
   * keyword classifier found nothing. Receives only the question and the
   * public topic list — never case data.
   */
  classifyTopics?(question: string, options?: { signal?: AbortSignal }): Promise<TopicId[]>;
}
