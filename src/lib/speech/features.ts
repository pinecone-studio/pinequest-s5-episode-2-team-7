import "server-only";
import { ApiError } from "@/lib/api/http";
import { getConfig } from "@/lib/config";
import type { VoiceFeatures } from "@/lib/views";

/**
 * Optional voice features. Each one is switched on only when its server-side
 * key is configured; otherwise the interview stays text-only as before.
 */
type Sex = "male" | "female";

export function voiceFor(sex: Sex): string {
  const c = getConfig();
  return sex === "male" ? c.CHIMEGE_VOICE_MALE : c.CHIMEGE_VOICE_FEMALE;
}

function simliFaceFor(sex: Sex): string | undefined {
  const c = getConfig();
  return sex === "male" ? c.SIMLI_FACE_ID_MALE : c.SIMLI_FACE_ID_FEMALE;
}

export function getVoiceFeatures(sex: Sex): VoiceFeatures {
  const c = getConfig();
  const speechOutput = Boolean(c.CHIMEGE_TTS_TOKEN);
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
