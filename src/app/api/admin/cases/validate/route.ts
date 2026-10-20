import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireAdmin, route } from "@/lib/api/http";
import { toPublicCase } from "@/lib/cases/public";
import { validateCase } from "@/lib/cases/schema";
import { inspectCase } from "@/lib/services/quality";

/** Validate a case without saving it; returns issues and a student preview. */
export const POST = route(async (request) => {
  await requireAdmin(request);
  const body = await parseJson(request, z.object({ case: z.unknown() }));
  const result = validateCase(body.case);
  if (!result.ok) return NextResponse.json({ ok: false, issues: result.issues });
  return NextResponse.json({ ok: true, preview: toPublicCase(result.case), quality: inspectCase(result.case) });
});
