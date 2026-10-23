import { after, NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireUser, route } from "@/lib/api/http";
import { getBackupProvider, getPatientProvider } from "@/lib/patient/providers";
import { listSessions, startSession } from "@/lib/services/sessions";

export const GET = route(async (request) => {
  const auth = await requireUser(request);
  return NextResponse.json({ sessions: await listSessions(auth) });
});

export const POST = route(async (request) => {
  const auth = await requireUser(request);
  const { caseId } = await parseJson(request, z.object({ caseId: z.string().min(1).max(80) }));
  const session = await startSession(auth, caseId);
  warmUpModel();
  return NextResponse.json(session, { status: 201 });
});

/** Wake a sleeping model while the student reads the case; never delays or fails the request. */
function warmUpModel() {
  try {
    for (const provider of [getPatientProvider(), getBackupProvider()]) {
      if (provider?.warmUp) after(() => provider.warmUp!().catch(() => {}));
    }
  } catch {
    // A failed warm-up only means the first turn may fall back.
  }
}
