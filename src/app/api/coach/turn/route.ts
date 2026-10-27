import { z } from "zod";
import { Errors, parseJson, requireUser, route } from "@/lib/api/http";
import { streamTurn } from "@/lib/coach/engine";
import { COACH_DIFFICULTIES, COACH_MODES, type TurnEvent } from "@/lib/coach/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolvePack } from "@/lib/services/coach";

const TurnSchema = z.object({
  packRef: z.string().min(1).max(64),
  mode: z.enum(COACH_MODES).default("video"),
  difficulty: z.enum(COACH_DIFFICULTIES).default("medium"),
  history: z
    .array(z.object({ role: z.enum(["me", "ai"]), text: z.string().max(2_000), t: z.number().min(0).max(7_200) }))
    .max(80),
});

/**
 * The persona's next reply, streamed as NDJSON (`{t:"emo"|"say"|"end"|"done"|"error"}` per line)
 * so the page can start speaking after the first sentence. Closing the request
 * (the trainee interrupted) stops Claude.
 */
export const POST = route(async (request) => {
  const auth = await requireUser(request);
  const limit = checkRateLimit(`coach-turn:${auth.userId}`, 40);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  const input = await parseJson(request, TurnSchema);
  const { pack } = await resolvePack(auth.userId, input.packRef);

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: TurnEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Client gone.
        }
      };
      try {
        await streamTurn(pack, input, emit, request.signal);
      } catch (error) {
        if (!request.signal.aborted) emit({ t: "error", error: error instanceof Error ? error.message : "AI хариулж чадсангүй." });
      }
      try {
        controller.close();
      } catch {
        // Already closed.
      }
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
});
