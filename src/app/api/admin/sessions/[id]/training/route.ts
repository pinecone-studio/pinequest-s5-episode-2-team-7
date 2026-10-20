import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireAdmin, route } from "@/lib/api/http";
import { proposeSessionForTraining } from "@/lib/services/training";

type Ctx = { params: Promise<{ id: string }> };

/** Approve or reject an interview transcript as training data. */
export const POST = route<Ctx>(async (request, { params }) => {
  const auth = await requireAdmin(request);
  const { id } = await params;
  const body = await parseJson(request, z.object({ status: z.enum(["approved", "rejected"]), notes: z.string().max(1000).optional() }));
  return NextResponse.json({ example: await proposeSessionForTraining(id, auth.userId, body.status, body.notes) });
});
