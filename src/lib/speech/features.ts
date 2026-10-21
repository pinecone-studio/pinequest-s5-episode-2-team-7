import "server-only";
import { ApiError } from "@/lib/api/http";
import { getConfig } from "@/lib/config";
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
export function speak(text: string, sex: Sex, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const voice = voiceFor(sex);
  return getConfig().TTS_PROVIDER === "elevenlabs" ? synthesizeElevenLabs(text, voice, signal) : synthesizeChimege(text, voice, signal);
}

function ttsConfigured(sex: Sex): boolean {
  const c = getConfig();
  return c.TTS_PROVIDER === "elevenlabs" ? Boolean(c.ELEVENLABS_API_KEY && voiceFor(sex)) : Boolean(c.CHIMEGE_TTS_TOKEN);
}

function simliFaceFor(sex: Sex): string | undefined {
  const c = getConfig();
  return sex === "male" ? c.SIMLI_FACE_ID_MALE : c.SIMLI_FACE_ID_FEMALE;
}

export function getVoiceFeatures(sex: Sex): VoiceFeatures {
  const c = getConfig();
  const speechOutput = ttsConfigured(sex);
  return {
    speechInput: Boolean(c.CHIMEGE_STT_TOKEN),
    speechOutput,
    // The avatar lip-syncs to the patient's synthesized voice, so it needs TTS too.
    avatar: speechOutput && Boolean(c.SIMLI_API_KEY && simliFaceFor(sex)),
  };
}

/**
 * Short-lived Simli session token for the patient's face. The Simli API key
 * stays on the server; sessions are capped to keep paid minutes bounded.
 */
export async function createAvatarToken(sex: Sex, signal?: AbortSignal): Promise<string> {
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
