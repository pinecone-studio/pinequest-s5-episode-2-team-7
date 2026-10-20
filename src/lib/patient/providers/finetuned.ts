import { PROMPT_FORMAT_VERSION } from "../context";
import type { ChatRequest } from "./base";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { ProviderError, type ProviderHealth, type ProviderId } from "./types";

interface InferenceHealth {
  status?: string;
  adapter_id?: string | null;
  base_model?: string;
  prompt_format?: string;
}

const VERIFY_TTL_MS = 5 * 60_000;

/**
 * Our fine-tuned patient model served by `inference/` (OpenAI-compatible
 * API + `/health` metadata). Answers are only produced — and only labelled
 * "fine-tuned" — after the service proves it is running the expected
 * adapter with the same prompt format the app sends. Otherwise generation
 * fails with `unverified_model`, so the simulator falls back (and records
 * the fallback) or shows an error. It never silently pretends.
 */
export class FineTunedPatientProvider extends OpenAICompatibleProvider {
  override readonly id: ProviderId = "finetuned";
  override readonly label: string;
  private verifiedAt = 0;
  private lastHealth: ProviderHealth | null = null;

  constructor(
    baseUrl: string,
    model: string,
    apiKey: string | undefined,
    private readonly expectedAdapter: string | undefined,
    fetchImpl: typeof fetch = fetch,
  ) {
    super(baseUrl, model, apiKey, fetchImpl);
    if (!expectedAdapter) throw new ProviderError("FINETUNED_EXPECTED_ADAPTER is not set.", "finetuned", "config");
    this.label = `Fine-tuned (${expectedAdapter})`;
  }

  private healthUrl(): string {
    return `${this.baseUrl.replace(/\/v1$/, "")}/health`;
  }

  override async health(): Promise<ProviderHealth> {
    const started = Date.now();
    let info: InferenceHealth;
    try {
      const response = await this.fetchImpl(this.healthUrl(), { headers: this.headers() });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      info = (await response.json()) as InferenceHealth;
    } catch (error) {
      this.lastHealth = { ok: false, provider: this.id, model: this.model, detail: `Inference service unavailable: ${(error as Error).message}` };
      return this.lastHealth;
    }
    const problems: string[] = [];
    if (info.adapter_id !== this.expectedAdapter) problems.push(`adapter "${info.adapter_id ?? "none"}" ≠ expected "${this.expectedAdapter}"`);
    if (info.prompt_format !== PROMPT_FORMAT_VERSION) problems.push(`prompt format "${info.prompt_format}" ≠ "${PROMPT_FORMAT_VERSION}"`);
    this.lastHealth = {
      ok: problems.length === 0,
      provider: this.id,
      model: this.model,
      adapter: info.adapter_id ?? undefined,
      detail: problems.length === 0 ? `Баталгаажсан: ${info.base_model} + ${info.adapter_id}` : `Баталгаажаагүй: ${problems.join("; ")}`,
      latencyMs: Date.now() - started,
    };
    if (this.lastHealth.ok) this.verifiedAt = Date.now();
    return this.lastHealth;
  }

  override async complete(request: ChatRequest, options?: { signal?: AbortSignal }): Promise<string> {
    if (Date.now() - this.verifiedAt > VERIFY_TTL_MS) {
      const health = await this.health();
      if (!health.ok) throw new ProviderError(health.detail, "finetuned", "unverified_model");
    }
    return super.complete(request, options);
  }
}
