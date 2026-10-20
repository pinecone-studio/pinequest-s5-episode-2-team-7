import { ChatModelProvider, type ChatRequest } from "./base";
import { ProviderError, type ProviderHealth } from "./types";

const API = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: { message?: string } };
    return data.error?.message?.slice(0, 300) ?? "";
  } catch {
    return "";
  }
}

/**
 * Google Gemini via the REST generateContent API (free tier available at
 * https://aistudio.google.com). Note: on the free tier Google may use
 * prompts to improve its products — only synthetic cases are sent.
 */
export class GeminiPatientProvider extends ChatModelProvider {
  readonly id = "gemini" as const;
  readonly label: string;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    super();
    if (!apiKey) throw new ProviderError("GEMINI_API_KEY is not set.", "gemini", "config");
    this.label = `Gemini (${model})`;
  }

  async complete(request: ChatRequest, options?: { signal?: AbortSignal }): Promise<string> {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: request.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: {
        temperature: request.temperature ?? 0.5,
        maxOutputTokens: request.maxTokens,
        // Flash models can skip internal reasoning, which keeps latency and
        // free-tier token use low for short patient replies.
        ...(/flash/.test(this.model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    };
    let response: Response;
    try {
      response = await this.fetchImpl(`${API}/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify(body),
        signal: options?.signal,
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") throw new ProviderError("Gemini request timed out", "gemini", "timeout");
      throw new ProviderError("Could not reach Gemini", "gemini", "network");
    }
    if (response.status === 429) throw new ProviderError("Gemini rate limit / quota exceeded", "gemini", "rate_limit");
    if (!response.ok) {
      // Google explains retired models and bad keys in error.message; keep it for diagnostics.
      const detail = await errorMessage(response);
      throw new ProviderError(
        `Gemini HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
        "gemini",
        response.status === 400 || response.status === 403 ? "config" : "bad_response",
      );
    }

    const data = (await response.json()) as GeminiResponse;
    if (data.promptFeedback?.blockReason) throw new ProviderError(`Gemini blocked the prompt (${data.promptFeedback.blockReason})`, "gemini", "bad_response");
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) throw new ProviderError(`Gemini returned no text (${candidate?.finishReason ?? "unknown"})`, "gemini", "bad_response");
    return text;
  }

  async health(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const response = await this.fetchImpl(`${API}/models/${encodeURIComponent(this.model)}`, { headers: { "x-goog-api-key": this.apiKey } });
      return {
        ok: response.ok,
        provider: this.id,
        model: this.model,
        detail: response.ok ? "Gemini API хүрэлцэхүйц, загвар олдлоо." : `HTTP ${response.status} — API түлхүүр эсвэл загварын нэрийг шалгана уу.`,
        latencyMs: Date.now() - started,
      };
    } catch {
      return { ok: false, provider: this.id, model: this.model, detail: "Gemini API-д холбогдож чадсангүй." };
    }
  }
}
