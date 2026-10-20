import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireAdmin, route } from "@/lib/api/http";
import { toPublicCase } from "@/lib/cases/public";
import { getCaseAdmin, setCaseStatus, updateCase } from "@/lib/services/cases";
import { inspectCase } from "@/lib/services/quality";

type Ctx = { params: Promise<{ id: string }> };

/** Full private case + student preview + quality issues (admin only). */
export const GET = route<Ctx>(async (request, { params }) => {
  await requireAdmin(request);
  const { id } = await params;
  const { summary, data } = await getCaseAdmin(id);
  return NextResponse.json({ summary, case: data, preview: toPublicCase(data), quality: inspectCase(data) });
});

export const PUT = route<Ctx>(async (request, { params }) => {
  await requireAdmin(request);
  const { id } = await params;
  const body = await parseJson(request, z.object({ case: z.unknown() }));
  return NextResponse.json({ case: await updateCase(id, body.case) });
});

export const PATCH = route<Ctx>(async (request, { params }) => {
  await requireAdmin(request);
  const { id } = await params;
  const { status } = await parseJson(request, z.object({ status: z.enum(["draft", "published", "archived"]) }));
  return NextResponse.json({ case: await setCaseStatus(id, status) });
});
