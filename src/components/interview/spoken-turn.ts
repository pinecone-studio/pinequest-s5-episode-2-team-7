import { ClientApiError } from "@/lib/fetcher";
import type { MessageView, ProviderBadge } from "@/lib/views";

export interface SpokenTurnResult {
  messages: MessageView[];
  questionCount: number;
  provider: ProviderBadge;
  /** How many reply sentences arrived with the stream (0 → fetch audio as before). */
  spokenParts: number;
}

export interface SpokenTurnHandlers {
  /** A reply sentence starts (its audio follows). */
  onSentence(text: string): void;
  /** A piece of the current sentence's voice: raw 16 kHz PCM16. */
  onAudio(pcm: Uint8Array): void;
  /** The current sentence's voice is complete. */
  onSentenceEnd(): void;
}

/**
 * Sends a question and receives the reply as it is written: each sentence
 * and its voice arrive piece by piece, before the whole reply exists, so
 * playback starts at once. Resolves with the stored messages.
 */
export async function askSpoken(url: string, body: { content: string; emotion: string }, handlers: SpokenTurnHandlers): Promise<SpokenTurnResult> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify(body) });
  } catch {
    throw new ClientApiError("Сервертэй холбогдож чадсангүй. Интернэт холболтоо шалгана уу.", 0, "network");
  }
  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ClientApiError(data?.error?.message ?? `Алдаа гарлаа (${response.status}).`, response.status, data?.error?.code ?? "unknown");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const event = JSON.parse(line) as
        | { type: "sentence"; text: string }
        | { type: "audio"; pcm: string }
        | { type: "sentenceEnd" }
        | ({ type: "done" } & SpokenTurnResult)
        | { type: "error"; status: number; error: { code: string; message: string } };
      if (event.type === "sentence") handlers.onSentence(event.text);
      else if (event.type === "audio") handlers.onAudio(base64ToBytes(event.pcm));
      else if (event.type === "sentenceEnd") handlers.onSentenceEnd();
      else if (event.type === "error") throw new ClientApiError(event.error.message, event.status, event.error.code);
      else return { messages: event.messages, questionCount: event.questionCount, provider: event.provider, spokenParts: event.spokenParts };
    }
    if (done) break;
  }
  throw new ClientApiError("Хариулт дутуу ирлээ. Дахин оролдоно уу.", 0, "incomplete");
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
