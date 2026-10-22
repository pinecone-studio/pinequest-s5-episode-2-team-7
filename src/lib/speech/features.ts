import "server-only";
import CASE_AVATARS from "../../../data/avatars.json";
import { ApiError } from "@/lib/api/http";
import { getConfig } from "@/lib/config";
import { EMOTIONS, type EmotionId } from "@/lib/patient/emotions";
import type { VoiceFeatures } from "@/lib/views";
import { pcmFromWav, synthesize as synthesizeChimege } from "./chimege";
import { synthesizeElevenLabs } from "./elevenlabs";
import { speechInputConfigured } from "./stt";

/**
 * Optional voice features. Each one is switched on only when its server-side
 * key is configured; otherwise the interview stays text-only as before.
 */
type Sex = "male" | "female";

/** The configured voice for this patient (a Chimege voice name or an ElevenLabs voice id). */
export function voiceFor(sex: Sex): string {
  const c = getConfig();
  if (c.TTS_PROVIDER === "elevenlabs") return (sex === "male" ? c.ELEVENLABS_VOICE_MALE : c.ELEVENLABS_VOICE_FEMALE) ?? "";
  return sex === "male" ? c.CHIMEGE_VOICE_MALE : c.CHIMEGE_VOICE_FEMALE;
}

/** Text → 16 kHz mono WAV in the patient's voice, using the configured TTS service. */
export function speak(text: string, sex: Sex, emotion?: EmotionId, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const c = getConfig();
  const voice = voiceFor(sex);
  if (c.TTS_PROVIDER !== "elevenlabs") return synthesizeChimege(text, voice, signal);
  const tag = c.ELEVENLABS_EMOTION_TAGS === "on" && emotion ? EMOTIONS[emotion].voiceTag : "";
  return synthesizeElevenLabs(tag ? `${tag} ${text}` : text, voice, signal);
}

/**
 * Like `speak`, but reports the audio as it is synthesized (raw 16 kHz PCM16
 * pieces) so playback can start before the sentence is finished. Services
 * without streaming report the whole sentence as one piece.
 */
export async function speakStreaming(text: string, sex: Sex, emotion: EmotionId | undefined, onPcm: (pcm: Uint8Array) => void, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const c = getConfig();
  const voice = voiceFor(sex);
  if (c.TTS_PROVIDER !== "elevenlabs") {
    const wav = await synthesizeChimege(text, voice, signal);
    onPcm(pcmFromWav(wav));
    return wav;
  }
  const tag = c.ELEVENLABS_EMOTION_TAGS === "on" && emotion ? EMOTIONS[emotion].voiceTag : "";
  return synthesizeElevenLabs(tag ? `${tag} ${text}` : text, voice, signal, onPcm);
}

/** Whether `emotion` changes the synthesized audio (so it must be part of cache keys). */
export function voiceUsesEmotion(): boolean {
  const c = getConfig();
  return c.TTS_PROVIDER === "elevenlabs" && c.ELEVENLABS_EMOTION_TAGS === "on";
}

function ttsConfigured(sex: Sex): boolean {
  const c = getConfig();
  return c.TTS_PROVIDER === "elevenlabs" ? Boolean(c.ELEVENLABS_API_KEY && voiceFor(sex)) : Boolean(c.CHIMEGE_TTS_TOKEN);
}

function simliFaceFor(sex: Sex): string | undefined {
  const c = getConfig();
  return sex === "male" ? c.SIMLI_FACE_ID_MALE : c.SIMLI_FACE_ID_FEMALE;
}

/** Comma-separated avatar ids for each sex, so several faces can be configured. */
export function anamAvatars(sex: Sex): string[] {
  const c = getConfig();
  const list = (sex === "male" ? c.ANAM_AVATAR_ID_MALE : c.ANAM_AVATAR_ID_FEMALE) ?? "";
  return list
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * The face for a case: its own avatar from data/avatars.json when listed,
 * otherwise one of the configured ids (stable: a case always gets the same one).
 */
export function anamAvatarFor(sex: Sex, caseId = ""): string | undefined {
  const own = (CASE_AVATARS as Record<string, { anam?: string } | string>)[caseId];
  if (typeof own === "object" && own.anam) return own.anam;
  const ids = anamAvatars(sex);
  if (ids.length === 0) return undefined;
  let hash = 0;
  for (const ch of caseId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return ids[hash % ids.length];
}

function avatarConfigured(sex: Sex): boolean {
  const c = getConfig();
  return c.AVATAR_PROVIDER === "anam" ? Boolean(c.ANAM_API_KEY && anamAvatarFor(sex)) : Boolean(c.SIMLI_API_KEY && simliFaceFor(sex));
}

export function getVoiceFeatures(sex: Sex): VoiceFeatures {
  const c = getConfig();
  const speechOutput = ttsConfigured(sex);
  return {
    speechInput: speechInputConfigured(),
    speechOutput,
    // The avatar lip-syncs to the patient's synthesized voice, so it needs TTS too.
    avatar: speechOutput && avatarConfigured(sex),
    avatarProvider: c.AVATAR_PROVIDER,
  };
}

/**
 * Short-lived session token for the patient's face from the configured avatar
 * service. API keys stay on the server; sessions are capped to keep paid
 * minutes bounded.
 */
export async function createAvatarToken(sex: Sex, emotion?: EmotionId, signal?: AbortSignal, caseId?: string): Promise<string> {
  return getConfig().AVATAR_PROVIDER === "anam" ? createAnamToken(anamAvatarFor(sex, caseId), emotion, signal) : createSimliToken(sex, signal);
}

/** Anam token for the «Шүүлэг» examiner (Anam only; lip-syncs to the male TTS voice). */
export async function createExaminerAvatarToken(): Promise<string> {
  const c = getConfig();
  if (c.AVATAR_PROVIDER !== "anam" || !ttsConfigured("male")) throw new ApiError(503, "avatar_unavailable", "Аватар тохируулагдаагүй байна.");
  return createAnamToken(c.ANAM_EXAMINER_AVATAR_ID);
}

/**
 * Anam session in audio-passthrough mode: Anam renders the face and lip-syncs
 * to the PCM we stream (our TTS voice); its own LLM and voice are not used.
 */
async function createAnamToken(avatarId: string | undefined, emotion?: EmotionId, signal?: AbortSignal): Promise<string> {
  const c = getConfig();
  if (!c.ANAM_API_KEY || !avatarId) throw new ApiError(503, "avatar_unavailable", "Аватар тохируулагдаагүй байна.");
  const request = JSON.stringify({
    personaConfig: {
      avatarId,
      ...(c.ANAM_AVATAR_MODEL ? { avatarModel: c.ANAM_AVATAR_MODEL } : {}),
      enableAudioPassthrough: true,
      maxSessionLengthSeconds: 900,
      // Facial performance style (Cara 4 avatars; ignored by older models).
      ...(emotion ? { directorNotes: { presetStyle: EMOTIONS[emotion].anamPreset, expressivity: 0.7 } } : {}),
    },
  });
  let response: Response | undefined;
  // A token normally comes back in ~1 s; a stalled connection is cut at 6 s and tried once more.
  for (let attempt = 1; attempt <= 2 && !response; attempt++) {
    try {
      response = await fetch("https://api.anam.ai/v1/auth/session-token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.ANAM_API_KEY}` },
        body: request,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(6_000)]) : AbortSignal.timeout(6_000),
      });
    } catch (error) {
      console.warn(`[avatar] Anam token attempt ${attempt} failed:`, error instanceof Error ? (error.cause ?? error.message) : error);
      if (signal?.aborted) break;
    }
  }
  if (!response) throw new ApiError(503, "avatar_unavailable", "Аватарын үйлчилгээнд холбогдож чадсангүй. Дахин оролдоно уу.");
  const body = (await response.json().catch(() => null)) as { sessionToken?: string } | null;
  if (!response.ok || !body?.sessionToken) {
    console.error(`[avatar] Anam HTTP ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
    throw new ApiError(503, "avatar_unavailable", "Аватарын үйлчилгээ хариу өгсөнгүй.");
  }
  return body.sessionToken;
}

async function createSimliToken(sex: Sex, signal?: AbortSignal): Promise<string> {
  const c = getConfig();
  const faceId = simliFaceFor(sex);
  if (!c.SIMLI_API_KEY || !faceId) throw new ApiError(503, "avatar_unavailable", "Аватар тохируулагдаагүй байна.");
  let response: Response;
  try {
    response = await fetch("https://api.simli.ai/compose/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-simli-api-key": c.SIMLI_API_KEY },
      body: JSON.stringify({ faceId, handleSilence: true, maxSessionLength: 900, maxIdleTime: 180 }),
      signal,
    });
  } catch {
    throw new ApiError(503, "avatar_unavailable", "Аватарын үйлчилгээнд холбогдож чадсангүй.");
  }
  const body = (await response.json().catch(() => null)) as { session_token?: string } | null;
  if (!response.ok || !body?.session_token) throw new ApiError(503, "avatar_unavailable", "Аватарын үйлчилгээ хариу өгсөнгүй.");
  return body.session_token;
}
