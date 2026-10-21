import Anthropic from "@anthropic-ai/sdk";
import { ChatModelProvider, type ChatRequest } from "./base";
import { ProviderError, type ProviderHealth } from "./types";

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

/**
 * Anthropic Claude (paid). Patient replies are short, so `effort: "low"` is
 * used; the server-side refusal fallback is enabled where supported so a
 * classifier decline is re-run on Anthropic's recommended model.
 */
export class AnthropicPatientProvider extends ChatModelProvider {
  readonly id = "anthropic" as const;
  readonly label: string;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    super();
    if (!apiKey) throw new ProviderError("ANTHROPIC_API_KEY is not set.", "anthropic", "config");
    // Explicit base URL: never inherit ANTHROPIC_BASE_URL from the host
    // environment (e.g. a developer tool's proxy) and send the key elsewhere.
    this.client = new Anthropic({ apiKey, maxRetries: 1, baseURL: "https://api.anthropic.com" });
    this.label = `Claude (${model})`;
  }

  async complete(request: ChatRequest, options?: { signal?: AbortSignal }): Promise<string> {
    try {
      const response = await this.client.beta.messages.create(
        {
          model: this.model,
          // Headroom for adaptive thinking on current models; replies are short.
          max_tokens: Math.max(2048, request.maxTokens),
          system: request.system,
          messages: request.messages,
          output_config: { effort: "low" },
          ...(FALLBACK_MODELS.has(this.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        },
        { signal: options?.signal },
      );
      if (response.stop_reason === "refusal") throw new ProviderError("Claude declined the request", "anthropic", "bad_response");
      const text = response.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("")
        .trim();
      if (!text) throw new ProviderError(`Claude returned no text (${response.stop_reason})`, "anthropic", "bad_response");
      return text;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof Anthropic.AuthenticationError) throw new ProviderError("Invalid ANTHROPIC_API_KEY", "anthropic", "config");
      if (error instanceof Anthropic.NotFoundError) throw new ProviderError(`Unknown model ${this.model}`, "anthropic", "config");
      if (error instanceof Anthropic.RateLimitError) throw new ProviderError("Claude rate limit", "anthropic", "rate_limit");
      if (error instanceof Anthropic.APIConnectionTimeoutError) throw new ProviderError("Claude request timed out", "anthropic", "timeout");
      if (error instanceof Anthropic.APIUserAbortError) throw new ProviderError("Claude request aborted", "anthropic", "timeout");
      if (error instanceof Anthropic.APIConnectionError) throw new ProviderError("Could not reach the Claude API", "anthropic", "network");
      if (error instanceof Anthropic.APIError) throw new ProviderError(`Claude API error ${error.status}`, "anthropic", "bad_response");
      throw error;
    }
  }

  async health(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const model = await this.client.models.retrieve(this.model);
      return { ok: true, provider: this.id, model: model.id, detail: "Claude API хүрэлцэхүйц.", latencyMs: Date.now() - started };
    } catch (error) {
      const detail = error instanceof Anthropic.AuthenticationError ? "API түлхүүр буруу." : error instanceof Anthropic.NotFoundError ? "Загвар олдсонгүй." : "Claude API-д холбогдож чадсангүй.";
      return { ok: false, provider: this.id, model: this.model, detail };
    }
  }
}
