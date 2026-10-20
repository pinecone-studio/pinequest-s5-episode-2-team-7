import "server-only";
import { ApiError } from "@/lib/api/http";
import { getConfig } from "@/lib/config";

/**
 * Chimege (chimege.com) Mongolian speech services, called only from the
 * server so tokens never reach the browser.
 *   - transcribe: 16 kHz mono 16-bit WAV (≤ 15 s per request) → text
 *   - synthesize: text → 16 kHz mono 16-bit WAV (also what Simli expects)
 * Each synthesize request uses one Chimege credit, so callers cache results.
 */

const STT_URL = "https://api.chimege.com/v1.2/transcribe";
const TTS_URL = "https://api.chimege.com/v1.2/synthesize";
export const SAMPLE_RATE = 16_000;
/** Chimege rejects audio longer than 15 s; 16-bit mono at 16 kHz = 32 000 B/s. */
export const MAX_STT_BYTES = 44 + 15 * SAMPLE_RATE * 2;

const unavailable = (what: string) => new ApiError(503, "speech_unavailable", `${what} үйлчилгээ одоогоор ажиллахгүй байна. Бичгээр асууна уу.`);

export async function transcribe(wav: Uint8Array<ArrayBuffer>, signal?: AbortSignal): Promise<string> {
  const token = getConfig().CHIMEGE_STT_TOKEN;
  if (!token) throw unavailable("Яриа таних");
  let response: Response;
  try {
    response = await fetch(STT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", Punctuate: "true", Token: token },
      body: wav,
      signal,
    });
  } catch {
    throw unavailable("Яриа таних");
  }
  const text = (await response.text()).trim();
  if (response.status === 400) throw new ApiError(400, "speech_unclear", "Бичлэгийг таньж чадсангүй. Дахин ярина уу.");
  if (!response.ok) throw unavailable("Яриа таних");
  return text;
}

/** Chimege accepts short texts only; split on sentence ends (as Sonor's speaker.dart). */
export function splitForSpeech(text: string, max = 200): string[] {
  const parts: string[] = [];
  let rest = text.trim().replace(/\s+/g, " ");
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = -1;
    for (const m of window.matchAll(/[.!?…,;:]\s/g)) cut = m.index;
    cut = cut > max / 3 ? cut + 1 : window.lastIndexOf(" ");
    if (cut <= 0) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function synthesize(text: string, voice: string, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const token = getConfig().CHIMEGE_TTS_TOKEN;
  if (!token) throw unavailable("Дуу гаргах");
  const pcms: Uint8Array[] = [];
  for (const chunk of splitForSpeech(text)) {
    let response: Response;
    try {
      response = await fetch(TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Token: token,
          "voice-id": voice,
          speed: "1",
          pitch: "1",
          "sample-rate": String(SAMPLE_RATE),
        },
        body: chunk,
        signal,
      });
    } catch {
      throw unavailable("Дуу гаргах");
    }
    if (!response.ok) throw unavailable("Дуу гаргах");
    pcms.push(pcmFromWav(new Uint8Array(await response.arrayBuffer())));
  }
  return wavFromPcm(concat(pcms));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The PCM samples of a WAV file (its "data" chunk). */
export function pcmFromWav(wav: Uint8Array): Uint8Array {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let at = 12;
  while (at + 8 <= wav.length) {
    const id = String.fromCharCode(...wav.subarray(at, at + 4));
    const size = view.getUint32(at + 4, true);
    if (id === "data") return wav.subarray(at + 8, Math.min(at + 8 + size, wav.length));
    at += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

export function wavFromPcm(pcm: Uint8Array, sampleRate = SAMPLE_RATE): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => (out[at + i] = c.charCodeAt(0)));
  ascii(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

/** Cheap check that an upload is a 16 kHz mono 16-bit PCM WAV. */
export function isSpeechWav(wav: Uint8Array): boolean {
  if (wav.length < 44 || String.fromCharCode(...wav.subarray(0, 4)) !== "RIFF" || String.fromCharCode(...wav.subarray(8, 12)) !== "WAVE") return false;
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  return v.getUint16(20, true) === 1 && v.getUint16(22, true) === 1 && v.getUint32(24, true) === SAMPLE_RATE && v.getUint16(34, true) === 16;
}
