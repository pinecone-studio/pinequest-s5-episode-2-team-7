import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { Errors } from "@/lib/api/http";
import type { SessionData } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSpeechWav, MAX_STT_BYTES, synthesize, transcribe } from "@/lib/speech/chimege";
import { createAvatarToken, voiceFor } from "@/lib/speech/features";
import { loadOwnedSession } from "./sessions";

/** Spoken replies are cached by message id: each synthesis costs a Chimege credit. */
const audioCache = new Map<string, Uint8Array<ArrayBuffer>>();
const AUDIO_CACHE_LIMIT = 200;

export async function transcribeQuestion(auth: SessionData, wav: Uint8Array<ArrayBuffer>): Promise<string> {
  const limit = checkRateLimit(`stt:${auth.userId}`, 20);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  if (wav.length > MAX_STT_BYTES) throw Errors.badRequest("Бичлэг 15 секундээс урт байна.");
  if (!isSpeechWav(wav)) throw Errors.badRequest("Дууны формат буруу байна (16 кГц WAV хүлээж байна).");
  return transcribe(wav);
}

/**
 * The spoken version of one of the patient's replies in the student's own
 * session. Only stored patient messages can be voiced, so the endpoint cannot
 * be used to synthesize arbitrary text.
 */
export async function patientReplyAudio(auth: SessionData, sessionId: string, messageId: string): Promise<Uint8Array<ArrayBuffer>> {
  if (!z.string().uuid().safeParse(messageId).success) throw Errors.notFound("Хариулт");
  const session = await loadOwnedSession(auth, sessionId);
  // Keyed by session too: a cached reply must never be served to another session.
  const key = `${session.id}:${messageId}`;
  const cached = audioCache.get(key);
  if (cached) return cached;

  const db = await getDb();
  const [row] = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.sessionId, session.id)));
  if (!row || row.role !== "patient") throw Errors.notFound("Хариулт");

  const limit = checkRateLimit(`tts:${auth.userId}`, 30);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const wav = await synthesize(row.content, voiceFor(session.caseSnapshot.public.patient.sex));
  if (audioCache.size >= AUDIO_CACHE_LIMIT) audioCache.delete(audioCache.keys().next().value!);
  audioCache.set(key, wav);
  return wav;
}

export async function startAvatar(auth: SessionData, sessionId: string): Promise<{ sessionToken: string }> {
  const session = await loadOwnedSession(auth, sessionId);
  if (session.status !== "active") throw Errors.conflict("Энэ ярилцлага дууссан байна.");
  const limit = checkRateLimit(`avatar:${auth.userId}`, 5);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  return { sessionToken: await createAvatarToken(session.caseSnapshot.public.patient.sex) };
}
