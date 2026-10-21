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

/**
 * With `onPcm`, the audio is streamed: raw PCM16 pieces (always whole
 * samples) are reported as ElevenLabs produces them — the first arrives in
 * about half the time the whole sentence takes. The full WAV is returned
 * either way.
 */
export function synthesizeElevenLabs(text: string, voiceId: string, signal?: AbortSignal, onPcm?: (pcm: Uint8Array) => void): Promise<Uint8Array<ArrayBuffer>> {
  return withSlot(getConfig().ELEVENLABS_CONCURRENCY, () => request(text, voiceId, signal, onPcm));
}

async function request(text: string, voiceId: string, signal?: AbortSignal, onPcm?: (pcm: Uint8Array) => void, retried = false): Promise<Uint8Array<ArrayBuffer>> {
  const c = getConfig();
  if (!c.ELEVENLABS_API_KEY || !voiceId) throw new ApiError(503, "speech_unavailable", "Дуу гаргах үйлчилгээ тохируулагдаагүй байна.");
  let response: Response;
  try {
    response = await fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId)}${onPcm ? "/stream" : ""}?output_format=pcm_${SAMPLE_RATE}`, {
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
    return request(text, voiceId, signal, onPcm, true);
  }
  if (!response.ok) {
    // ElevenLabs explains missing permissions / quota in detail.message; keep it for the server log.
    const detail = await response.text().catch(() => "");
    console.error(`[tts] ElevenLabs HTTP ${response.status}: ${detail.slice(0, 300)}`);
    throw new ApiError(503, "speech_unavailable", "Дуу гаргах үйлчилгээ одоогоор ажиллахгүй байна. Бичгээр үргэлжлүүлнэ үү.");
  }
  if (!onPcm || !response.body) return wavFromPcm(new Uint8Array(await response.arrayBuffer()));
  return wavFromPcm(await readPcmStream(response.body, onPcm));
}

/** Reads a PCM16 byte stream, reporting whole-sample pieces; returns all of it. */
export async function readPcmStream(body: ReadableStream<Uint8Array>, onPcm: (pcm: Uint8Array) => void): Promise<Uint8Array> {
  const pieces: Uint8Array[] = [];
  let carry: Uint8Array | null = null; // an odd trailing byte waits for its pair
  const reader = body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    let bytes = value;
    if (carry) {
      bytes = new Uint8Array(carry.length + value.length);
      bytes.set(carry);
      bytes.set(value, carry.length);
      carry = null;
    }
    const whole = bytes.length - (bytes.length % 2);
    if (whole < bytes.length) carry = bytes.slice(whole);
    if (whole > 0) {
      const piece = bytes.slice(0, whole);
      pieces.push(piece);
      onPcm(piece);
    }
  }
  const all = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const piece of pieces) {
    all.set(piece, at);
    at += piece.length;
  }
  return all;
}
