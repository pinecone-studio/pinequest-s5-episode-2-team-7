import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { Errors } from "@/lib/api/http";
import type { SessionData } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { getConfig } from "@/lib/config";
import { isSpeechWav, MAX_STT_BYTES, splitSentences, transcribe } from "@/lib/speech/chimege";
import type { EmotionId } from "@/lib/patient/emotions";
import { createAvatarToken, speak, voiceFor, voiceUsesEmotion } from "@/lib/speech/features";
import { loadOwnedSession } from "./sessions";

/** Spoken replies are cached by message id: each synthesis costs TTS credits. */
const audioCache = new Map<string, Uint8Array<ArrayBuffer>>();
const AUDIO_CACHE_LIMIT = 200;

export async function transcribeQuestion(auth: SessionData, wav: Uint8Array<ArrayBuffer>): Promise<string> {
  const limit = checkRateLimit(`stt:${auth.userId}`, 20);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  if (wav.length > MAX_STT_BYTES) throw Errors.badRequest("Бичлэг 15 секундээс урт байна.");
  if (!isSpeechWav(wav)) throw Errors.badRequest("Дууны формат буруу байна (16 кГц WAV хүлээж байна).");
  return transcribe(wav);
}

function remember(key: string, wav: Uint8Array<ArrayBuffer>) {
  if (audioCache.size >= AUDIO_CACHE_LIMIT) audioCache.delete(audioCache.keys().next().value!);
  audioCache.set(key, wav);
}

/**
 * The spoken version of one of the patient's replies in the student's own
 * session. Only stored patient messages can be voiced, so the endpoint cannot
 * be used to synthesize arbitrary text.
 *
 * With `part`, only that sentence group is voiced (see splitSentences), so
 * the client can start playing the first sentence sooner. `parts` is the
 * total number of parts either way.
 */
export async function patientReplyAudio(
  auth: SessionData,
  sessionId: string,
  messageId: string,
  part?: number,
  emotion?: EmotionId,
): Promise<{ wav: Uint8Array<ArrayBuffer>; parts: number }> {
  if (!z.string().uuid().safeParse(messageId).success) throw Errors.notFound("Хариулт");
  const session = await loadOwnedSession(auth, sessionId);

  const db = await getDb();
  const [row] = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.sessionId, session.id)));
  if (!row || row.role !== "patient") throw Errors.notFound("Хариулт");

  const sentences = splitSentences(row.content);
  if (part !== undefined && (part < 0 || part >= sentences.length)) throw Errors.notFound("Хариултын хэсэг");
  // Keyed by session too: a cached reply must never be served to another session.
  // The voice is part of the key so switching TTS service or voice is not masked by the cache.
  const sex = session.caseSnapshot.public.patient.sex;
  const mood = voiceUsesEmotion() ? (emotion ?? "") : "";
  const key = `${session.id}:${messageId}:${part ?? "all"}:${getConfig().TTS_PROVIDER}:${voiceFor(sex)}:${mood}`;
  const cached = audioCache.get(key);
  if (cached) return { wav: cached, parts: sentences.length };

  const limit = checkRateLimit(`tts:${auth.userId}`, 60);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const wav = await speak(part === undefined ? row.content : sentences[part], sex, emotion);
  remember(key, wav);
  return { wav, parts: sentences.length };
}

/**
 * Short hesitation sounds played the moment a question is sent, so the
 * patient seems to react while the real answer is being prepared. They are
 * fixed phrases, cached per voice (synthesized once per server instance).
 */
export const FILLERS = ["Ммм...", "За...", "Өө..."] as const;

export async function fillerAudio(auth: SessionData, sessionId: string, index: number): Promise<Uint8Array<ArrayBuffer>> {
  const filler = FILLERS[index];
  if (filler === undefined) throw Errors.notFound("Дуу");
  const session = await loadOwnedSession(auth, sessionId);
  const sex = session.caseSnapshot.public.patient.sex;
  const key = `filler:${getConfig().TTS_PROVIDER}:${voiceFor(sex)}:${index}`;
  const cached = audioCache.get(key);
  if (cached) return cached;
  const limit = checkRateLimit(`tts:${auth.userId}`, 60);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const wav = await speak(filler, sex);
  remember(key, wav);
  return wav;
}

export async function startAvatar(auth: SessionData, sessionId: string, emotion?: EmotionId): Promise<{ sessionToken: string; provider: "simli" | "anam" }> {
  const session = await loadOwnedSession(auth, sessionId);
  if (session.status !== "active") throw Errors.conflict("Энэ ярилцлага дууссан байна.");
  const limit = checkRateLimit(`avatar:${auth.userId}`, 5);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  return { sessionToken: await createAvatarToken(session.caseSnapshot.public.patient.sex, emotion, undefined, session.caseId), provider: getConfig().AVATAR_PROVIDER };
}
