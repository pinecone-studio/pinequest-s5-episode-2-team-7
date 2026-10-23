import { ChatModelProvider, type ChatRequest } from "./base";
import { ProviderError, type ProviderHealth, type ProviderId } from "./types";

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
}

interface ChatCompletionChunk {
  choices?: { delta?: { content?: string | null } }[];
}

const RATE_LIMIT_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 5_000;

/** Wait from `Retry-After` (seconds) or 1 s, 2 s; null when the server asks for longer than is worth waiting. */
export function retryDelayMs(retryAfter: string | null, attempt: number): number | null {
  const seconds = retryAfter === null ? NaN : Number(retryAfter);
  const ms = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 1000 * 2 ** attempt;
  return ms <= MAX_RETRY_WAIT_MS ? ms : null;
}

/**
 * Some reasoning models (e.g. Qwen3) emit <think> blocks. An unfinished block
 * (mid-stream) hides everything after its opening tag.
 */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/<think>[\s\S]*$/, "").trim();
}

/** Resolves after `ms`, or rejects as soon as `signal` aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
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
    const response = await this.post(request, false, options?.signal);
    const data = (await response.json()) as ChatCompletionResponse;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new ProviderError("Empty completion", this.id, "bad_response");
    return stripThinking(text);
  }

  /** Reads the server-sent `chat.completion.chunk` events and reports the reply as it grows. */
  override async completeStream(request: ChatRequest, options: { signal?: AbortSignal; onText: (soFar: string) => void }): Promise<string> {
    const response = await this.post(request, true, options.signal);
    if (!response.body) throw new ProviderError("Empty stream", this.id, "bad_response");
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let raw = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        let grew = false;
        for (const line of lines) {
          const data = line.trim();
          if (!data.startsWith("data:")) continue;
          const payload = data.slice(5).trim();
          if (payload === "[DONE]") continue;
          const delta = (JSON.parse(payload) as ChatCompletionChunk).choices?.[0]?.delta?.content;
          if (delta) {
            raw += delta;
            grew = true;
          }
        }
        const visible = stripThinking(raw);
        if (grew && visible) options.onText(visible);
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if ((error as Error).name === "AbortError" || options.signal?.aborted) throw new ProviderError("Model request timed out", this.id, "timeout");
      throw new ProviderError(`Stream failed: ${(error as Error).message}`, this.id, "bad_response");
    }
    const text = stripThinking(raw);
    if (!text) throw new ProviderError("Empty completion", this.id, "bad_response");
    return text;
  }

  /** POST /chat/completions with brief retries on 429; throws a ProviderError for any non-OK response. */
  private async post(request: ChatRequest, stream: boolean, signal?: AbortSignal): Promise<Response> {
    const body = JSON.stringify({
      model: this.model,
      messages: [{ role: "system", content: request.system }, ...request.messages],
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.5,
      stream,
    });
    let response: Response;
    for (let attempt = 0; ; attempt++) {
      try {
        response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, { method: "POST", headers: this.headers(), body, signal });
      } catch (error) {
        if ((error as Error).name === "AbortError") throw new ProviderError("Model request timed out", this.id, "timeout");
        throw new ProviderError(`Could not reach ${this.baseUrl}`, this.id, "network");
      }
      // Free tiers (e.g. Groq) return 429 when a few students ask at once;
      // the limit usually clears within seconds, so wait briefly and retry.
      if (response.status !== 429 || attempt >= RATE_LIMIT_RETRIES) break;
      const waitMs = retryDelayMs(response.headers.get("retry-after"), attempt);
      if (waitMs === null) break;
      await sleep(waitMs, signal).catch(() => {
        throw new ProviderError("Model request timed out", this.id, "timeout");
      });
    }
    if (response.status === 429) throw new ProviderError("Rate limited", this.id, "rate_limit");
    if (!response.ok) throw new ProviderError(`HTTP ${response.status}`, this.id, response.status === 401 || response.status === 404 ? "config" : "bad_response");
    return response;
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
