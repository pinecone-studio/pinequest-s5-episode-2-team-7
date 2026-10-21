import "server-only";
import { ApiError } from "@/lib/api/http";
import { getConfig } from "@/lib/config";
import { EMOTIONS, type EmotionId } from "@/lib/patient/emotions";
import type { VoiceFeatures } from "@/lib/views";
import { synthesize as synthesizeChimege } from "./chimege";
import { synthesizeElevenLabs } from "./elevenlabs";

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

function anamAvatarFor(sex: Sex): string | undefined {
  const c = getConfig();
  return sex === "male" ? c.ANAM_AVATAR_ID_MALE : c.ANAM_AVATAR_ID_FEMALE;
}

function avatarConfigured(sex: Sex): boolean {
  const c = getConfig();
  return c.AVATAR_PROVIDER === "anam" ? Boolean(c.ANAM_API_KEY && anamAvatarFor(sex)) : Boolean(c.SIMLI_API_KEY && simliFaceFor(sex));
}

export function getVoiceFeatures(sex: Sex): VoiceFeatures {
  const c = getConfig();
  const speechOutput = ttsConfigured(sex);
  return {
    speechInput: Boolean(c.CHIMEGE_STT_TOKEN),
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
export async function createAvatarToken(sex: Sex, emotion?: EmotionId, signal?: AbortSignal): Promise<string> {
  return getConfig().AVATAR_PROVIDER === "anam" ? createAnamToken(sex, emotion, signal) : createSimliToken(sex, signal);
}

/**
 * Anam session in audio-passthrough mode: Anam renders the face and lip-syncs
 * to the PCM we stream (our TTS voice); its own LLM and voice are not used.
 */
async function createAnamToken(sex: Sex, emotion?: EmotionId, signal?: AbortSignal): Promise<string> {
  const c = getConfig();
  const avatarId = anamAvatarFor(sex);
  if (!c.ANAM_API_KEY || !avatarId) throw new ApiError(503, "avatar_unavailable", "Аватар тохируулагдаагүй байна.");
  let response: Response;
  try {
    response = await fetch("https://api.anam.ai/v1/auth/session-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.ANAM_API_KEY}` },
      body: JSON.stringify({
        personaConfig: {
          avatarId,
          ...(c.ANAM_AVATAR_MODEL ? { avatarModel: c.ANAM_AVATAR_MODEL } : {}),
          enableAudioPassthrough: true,
          maxSessionLengthSeconds: 900,
          // Facial performance style (Cara 4 avatars; ignored by older models).
          ...(emotion ? { directorNotes: { presetStyle: EMOTIONS[emotion].anamPreset, expressivity: 0.7 } } : {}),
        },
      }),
      signal,
    });
  } catch {
    throw new ApiError(503, "avatar_unavailable", "Аватарын үйлчилгээнд холбогдож чадсангүй.");
  }
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
