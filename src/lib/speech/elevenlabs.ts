import "server-only";
import { ApiError } from "@/lib/api/http";
import { getConfig } from "@/lib/config";
import { SAMPLE_RATE, wavFromPcm } from "./chimege";

/**
 * ElevenLabs text-to-speech (elevenlabs.io). Mongolian is supported by the
 * Eleven v4 / v4 Turbo / v3 models (not by Multilingual v2 or Flash v2.5), so
 * the model is configurable and defaults to the low-latency `eleven_v4_turbo`.
 * Audio is requested as raw 16 kHz PCM — exactly what Simli lip-syncs to — and
 * wrapped as WAV like the Chimege output.
 */
const API = "https://api.elevenlabs.io/v1";

/**
 * ElevenLabs caps parallel requests per plan (2 on Free); replies, sentence
 * parts and fillers are requested together, so calls wait their turn here.
 */
let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(limit: number, run: () => Promise<T>): Promise<T> {
  if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await run();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export function synthesizeElevenLabs(text: string, voiceId: string, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  return withSlot(getConfig().ELEVENLABS_CONCURRENCY, () => request(text, voiceId, signal));
}

async function request(text: string, voiceId: string, signal?: AbortSignal, retried = false): Promise<Uint8Array<ArrayBuffer>> {
  const c = getConfig();
  if (!c.ELEVENLABS_API_KEY || !voiceId) throw new ApiError(503, "speech_unavailable", "Дуу гаргах үйлчилгээ тохируулагдаагүй байна.");
  let response: Response;
  try {
    response = await fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_${SAMPLE_RATE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": c.ELEVENLABS_API_KEY },
      body: JSON.stringify({
        text,
        model_id: c.ELEVENLABS_MODEL,
        language_code: "mn",
        // Lower stability = livelier, more human delivery for a worried patient.
        voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
      }),
      signal,
    });
  } catch {
    throw new ApiError(503, "speech_unavailable", "Дуу гаргах үйлчилгээнд холбогдож чадсангүй.");
  }
  if (response.status === 429 && !retried) {
    // Concurrency or rate limit: one short retry before giving up.
    await new Promise((resolve) => setTimeout(resolve, 700));
    return request(text, voiceId, signal, true);
  }
  if (!response.ok) {
    // ElevenLabs explains missing permissions / quota in detail.message; keep it for the server log.
    const detail = await response.text().catch(() => "");
    console.error(`[tts] ElevenLabs HTTP ${response.status}: ${detail.slice(0, 300)}`);
    throw new ApiError(503, "speech_unavailable", "Дуу гаргах үйлчилгээ одоогоор ажиллахгүй байна. Бичгээр үргэлжлүүлнэ үү.");
  }
  return wavFromPcm(new Uint8Array(await response.arrayBuffer()));
}
