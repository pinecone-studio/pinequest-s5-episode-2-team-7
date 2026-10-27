import { NextResponse } from "next/server";
import { Errors, parseJson, requireUser, route } from "@/lib/api/http";
import { CreatePackInputSchema, draftPackFromMaterial } from "@/lib/coach/engine";
import { checkRateLimit } from "@/lib/rate-limit";
import { listPacks, savePack } from "@/lib/services/coach";

/** Built-in personas + the custom packs this user may use (own and their teams'). */
export const GET = route(async (request) => {
  const auth = await requireUser(request);
  return NextResponse.json(await listPacks(auth.userId));
});

/** Body: `{ orgName, persona, mode, files: [{name, mediaType, data(base64)}], notes, teamId }` → a new custom pack. */
export const POST = route(async (request) => {
  const auth = await requireUser(request);
  const limit = checkRateLimit(`coach-pack:${auth.userId}`, 5);
  if (!limit.ok) throw Errors.rateLimited(limit.retryAfterSeconds);
  if (Number(request.headers.get("content-length") ?? 0) > 36 * 1024 * 1024) throw Errors.badRequest("Файлууд хэт том байна (нийт 25 МБ хүртэл).");
  const input = await parseJson(request, CreatePackInputSchema);
  const draft = await draftPackFromMaterial(input);
  return NextResponse.json({ pack: await savePack(auth.userId, draft, input.teamId) });
});
