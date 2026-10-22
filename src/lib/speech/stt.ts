import "server-only";
import { ApiError } from "@/lib/api/http";
import { getConfig } from "@/lib/config";
import { transcribe as chimegeTranscribe } from "./chimege";

/**
 * Speech-to-text for the student's spoken questions. Uses the first service
 * that has a key, falling through to the next one if a service fails:
 *   1. Chimege — built for Mongolian (CHIMEGE_STT_TOKEN, paid)
 *   2. Gemini — understands audio (GEMINI_API_KEY, free tier)
 *   3. Whisper on an OpenAI-compatible server, e.g. Groq (OPENAI_COMPAT_*, free tier)
 * All input is 16 kHz mono 16-bit WAV, at most 15 s.
 */

type Transcriber = { id: string; run: (wav: Uint8Array<ArrayBuffer>, signal?: AbortSignal) => Promise<string> };

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 20_000;

const GEMINI_PROMPT =
  "Энэ бичлэгт эмч монгол хэлээр өвчтөнд асуулт тавьж байна. Яг хэлсэн үгийг кирилл үсгээр, цэг таслалтай бичнэ үү. " +
  "Зөвхөн хэлсэн үгийг бич — тайлбар, орчуулга, хашилт нэмэхгүй. Яриа сонсогдохгүй бол юу ч бичихгүй.";

const unavailable = () => new ApiError(503, "speech_unavailable", "Яриа таних үйлчилгээ одоогоор ажиллахгүй байна. Бичгээр асууна уу.");

async function geminiTranscribe(wav: Uint8Array<ArrayBuffer>, signal?: AbortSignal): Promise<string> {
  const c = getConfig();
  const model = c.STT_GEMINI_MODEL;
  const response = await fetch(`${GEMINI_API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": c.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: GEMINI_PROMPT }, { inlineData: { mimeType: "audio/wav", data: Buffer.from(wav).toString("base64") } }] }],
      // No thinkingConfig: Gemini 3 lite models reject thinkingBudget and are fastest on their default.
      generationConfig: { temperature: 0, maxOutputTokens: 400 },
    }),
    signal,
  });
  if (!response.ok) throw new Error(`Gemini STT HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  return (data.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

async function whisperTranscribe(wav: Uint8Array<ArrayBuffer>, signal?: AbortSignal): Promise<string> {
  const c = getConfig();
  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "question.wav");
  form.append("model", c.STT_WHISPER_MODEL);
  form.append("language", "mn");
  form.append("temperature", "0");
  form.append("response_format", "json");
  const response = await fetch(`${c.OPENAI_COMPAT_BASE_URL!.replace(/\/+$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: c.OPENAI_COMPAT_API_KEY ? { authorization: `Bearer ${c.OPENAI_COMPAT_API_KEY}` } : {},
    body: form,
    signal,
  });
  if (!response.ok) throw new Error(`Whisper STT HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return ((await response.json()) as { text?: string }).text?.trim() ?? "";
}

function transcribers(): Transcriber[] {
  const c = getConfig();
  const list: Transcriber[] = [];
  if (c.CHIMEGE_STT_TOKEN) list.push({ id: "chimege", run: chimegeTranscribe });
  if (c.GEMINI_API_KEY) list.push({ id: "gemini", run: geminiTranscribe });
  if (c.OPENAI_COMPAT_BASE_URL) list.push({ id: "whisper", run: whisperTranscribe });
  return list;
}

export function speechInputConfigured(): boolean {
  return transcribers().length > 0;
}

export async function transcribeSpeech(wav: Uint8Array<ArrayBuffer>): Promise<string> {
  const list = transcribers();
  if (list.length === 0) throw unavailable();
  for (const t of list) {
    try {
      return await t.run(wav, AbortSignal.timeout(TIMEOUT_MS));
    } catch (error) {
      // An unclear recording will not get clearer on another service.
      if (error instanceof ApiError && error.code === "speech_unclear") throw error;
      console.warn(`[stt] ${t.id} failed:`, error instanceof Error ? error.message : error);
    }
  }
  throw unavailable();
}
