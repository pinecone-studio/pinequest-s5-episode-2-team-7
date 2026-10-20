import { ChatModelProvider, type ChatRequest } from "./base";
import { ProviderError, type ProviderHealth, type ProviderId } from "./types";

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
}

/**
 * Any server that implements the OpenAI-style `/chat/completions` endpoint:
 * Ollama (http://localhost:11434/v1), vLLM, LM Studio, llama.cpp server,
 * OpenRouter, Together, ...
 */
export class OpenAICompatibleProvider extends ChatModelProvider {
  readonly id: ProviderId = "openai_compatible";
  readonly label: string;

  constructor(
    protected readonly baseUrl: string,
    readonly model: string,
    protected readonly apiKey: string | undefined,
    protected readonly fetchImpl: typeof fetch = fetch,
  ) {
    super();
    if (!baseUrl) throw new ProviderError("Base URL is not set.", this.id, "config");
    if (!model) throw new ProviderError("Model name is not set.", this.id, "config");
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.label = `${model}`;
  }

  protected headers(): Record<string, string> {
    return { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) };
  }

  async complete(request: ChatRequest, options?: { signal?: AbortSignal }): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "system", content: request.system }, ...request.messages],
          max_tokens: request.maxTokens,
          temperature: request.temperature ?? 0.5,
          stream: false,
        }),
        signal: options?.signal,
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") throw new ProviderError("Model request timed out", this.id, "timeout");
      throw new ProviderError(`Could not reach ${this.baseUrl}`, this.id, "network");
    }
    if (response.status === 429) throw new ProviderError("Rate limited", this.id, "rate_limit");
    if (!response.ok) throw new ProviderError(`HTTP ${response.status}`, this.id, response.status === 401 || response.status === 404 ? "config" : "bad_response");
    const data = (await response.json()) as ChatCompletionResponse;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new ProviderError("Empty completion", this.id, "bad_response");
    // Some reasoning models (e.g. Qwen3) emit <think> blocks.
    return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  }

  async health(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/models`, { headers: this.headers() });
      return {
        ok: response.ok,
        provider: this.id,
        model: this.model,
        detail: response.ok ? "Сервер хариу өглөө." : `HTTP ${response.status}`,
        latencyMs: Date.now() - started,
      };
    } catch {
      return { ok: false, provider: this.id, model: this.model, detail: `${this.baseUrl} хаягт холбогдож чадсангүй.` };
    }
  }
}
