import { NextResponse } from "next/server";
import { Errors, requireUser, route } from "@/lib/api/http";
import { MAX_STT_BYTES } from "@/lib/speech/chimege";
import { transcribeQuestion } from "@/lib/services/voice";

/** Body: 16 kHz mono 16-bit WAV (≤ 15 s). Returns the recognised Mongolian text. */
export const POST = route(async (request) => {
  const auth = await requireUser(request);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_STT_BYTES) throw Errors.badRequest("Бичлэг 15 секундээс урт байна.");
  const wav = new Uint8Array(await request.arrayBuffer());
  return NextResponse.json({ text: await transcribeQuestion(auth, wav) });
});
