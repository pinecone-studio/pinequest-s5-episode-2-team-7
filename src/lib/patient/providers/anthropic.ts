import Anthropic from "@anthropic-ai/sdk";
import type { TopicId } from "../topics";
import { ChatModelProvider, parseTopicList, TOPIC_CLASSIFIER_SYSTEM, type ChatRequest } from "./base";
import { ProviderError, type ProviderHealth } from "./types";

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

/**
 * How to switch thinking off per model: patient replies are 1–3 sentences, so
 * thinking only adds latency. Sonnet 5.5 cannot fully disable it; between_tools
 * skips it outside tool loops (we use no tools).
 */
const NO_THINKING: Record<string, { type: "disabled" } | { type: "between_tools" }> = {
  "claude-sonnet-5-5": { type: "between_tools" },
  "claude-haiku-5-5": { type: "disabled" },
};

/**
 * Anthropic Claude (paid). Patient replies are short, so `effort: "low"` is
 * used and thinking is off where the model allows; the server-side refusal
 * fallback is enabled where supported so a classifier decline is re-run on
 * Anthropic's recommended model. Topic classification goes to a fast model
 * (Haiku) so a keyword miss does not add a slow second round trip.
 */
export class AnthropicPatientProvider extends ChatModelProvider {
  readonly id = "anthropic" as const;
  readonly label: string;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    private readonly classifierModel: string = model,
  ) {
    super();
    if (!apiKey) throw new ProviderError("ANTHROPIC_API_KEY is not set.", "anthropic", "config");
    // Explicit base URL: never inherit ANTHROPIC_BASE_URL from the host
    // environment (e.g. a developer tool's proxy) and send the key elsewhere.
    this.client = new Anthropic({ apiKey, maxRetries: 1, baseURL: "https://api.anthropic.com" });
    this.label = `Claude (${model})`;
  }

  complete(request: ChatRequest, options?: { signal?: AbortSignal }): Promise<string> {
    return this.send(this.model, request, options);
  }

  override async classifyTopics(question: string, options?: { signal?: AbortSignal }): Promise<TopicId[]> {
    const text = await this.send(
      this.classifierModel,
      { system: TOPIC_CLASSIFIER_SYSTEM, messages: [{ role: "user", content: question.slice(0, 500) }], maxTokens: 60, temperature: 0 },
      options,
    );
    return parseTopicList(text);
  }

  override async completeStream(request: ChatRequest, options: { signal?: AbortSignal; onText: (soFar: string) => void }): Promise<string> {
    return this.send(this.model, request, options);
  }

  private params(model: string, request: ChatRequest) {
    const thinking = NO_THINKING[model];
    return {
      model,
      // Without thinking the reply alone needs little room; with adaptive
      // thinking (other models) keep headroom so the text is not cut off.
      max_tokens: thinking ? Math.max(512, request.maxTokens) : Math.max(2048, request.maxTokens),
      system: request.system,
      messages: request.messages,
      output_config: { effort: "low" as const },
      ...(thinking ? { thinking } : {}),
      ...(FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    };
  }

  /** One request; with `onText` the reply is streamed and reported as it grows. */
  private async send(model: string, request: ChatRequest, options?: { signal?: AbortSignal; onText?: (soFar: string) => void }): Promise<string> {
    try {
      let response;
      if (options?.onText) {
        const onText = options.onText;
        let soFar = "";
        const stream = this.client.beta.messages.stream(this.params(model, request), { signal: options.signal });
        stream.on("text", (delta) => {
          soFar += delta;
          onText(soFar);
        });
        response = await stream.finalMessage();
      } else {
        response = await this.client.beta.messages.create(this.params(model, request), { signal: options?.signal });
      }
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
      if (error instanceof Anthropic.NotFoundError) throw new ProviderError(`Unknown model ${model}`, "anthropic", "config");
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
