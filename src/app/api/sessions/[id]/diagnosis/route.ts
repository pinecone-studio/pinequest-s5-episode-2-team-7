import { NextResponse } from "next/server";
import { parseJson, requireUser, route } from "@/lib/api/http";
import { DiagnosisInput, submitDiagnosis } from "@/lib/services/sessions";

type Ctx = { params: Promise<{ id: string }> };

/** Records the diagnosis, ends the interview and returns the evaluation. */
export const POST = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id } = await params;
  const input = await parseJson(request, DiagnosisInput);
  return NextResponse.json({ evaluation: await submitDiagnosis(auth, id, input) }, { status: 201 });
});
