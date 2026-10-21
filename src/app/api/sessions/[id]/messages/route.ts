import { NextResponse } from "next/server";
import { ApiError, parseJson, requireUser, route } from "@/lib/api/http";
import type { SessionData } from "@/lib/auth/session";
import type { EmotionId } from "@/lib/patient/emotions";
import { askQuestion, getSessionView, QuestionInput } from "@/lib/services/sessions";
import { askQuestionSpoken, type SpokenTurnEvent } from "@/lib/services/voice";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id } = await params;
  const session = await getSessionView(auth, id);
  return NextResponse.json({ messages: session.messages });
});

export const POST = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id } = await params;
  const { content, emotion } = await parseJson(request, QuestionInput);
  if (request.headers.get("accept")?.includes("application/x-ndjson")) return spokenTurn(auth, id, content, emotion);
  return NextResponse.json(await askQuestion(auth, id, content, emotion), { status: 201 });
});

/**
 * Streaming variant for voice calls: one JSON line per voiced sentence as the
 * patient's reply is written, then a `done` line with the stored messages
 * (or an `error` line).
 */
function spokenTurn(auth: SessionData, sessionId: string, content: string, emotion?: EmotionId): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SpokenTurnEvent | { type: "error"; status: number; error: { code: string; message: string } }) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await askQuestionSpoken(auth, sessionId, content, emotion, send);
      } catch (error) {
        if (error instanceof ApiError) send({ type: "error", status: error.status, error: { code: error.code, message: error.message } });
        else {
          console.error("[api] spoken turn failed:", error instanceof Error ? error.message : error);
          send({ type: "error", status: 500, error: { code: "internal_error", message: "Системийн алдаа гарлаа. Дахин оролдоно уу." } });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { status: 201, headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
