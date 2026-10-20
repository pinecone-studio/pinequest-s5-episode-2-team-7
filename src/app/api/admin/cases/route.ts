import { NextResponse } from "next/server";
import { parseJson, requireAdmin, route } from "@/lib/api/http";
import { z } from "zod";
import { createCase, listAllCases } from "@/lib/services/cases";

export const GET = route(async (request) => {
  await requireAdmin(request);
  return NextResponse.json({ cases: await listAllCases() });
});

export const POST = route(async (request) => {
  const auth = await requireAdmin(request);
  const body = await parseJson(request, z.object({ case: z.unknown() }));
  return NextResponse.json({ case: await createCase(body.case, auth.userId, "draft") }, { status: 201 });
});
