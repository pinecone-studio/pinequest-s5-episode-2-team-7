import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/api/http";
import { abandonSession } from "@/lib/services/sessions";

type Ctx = { params: Promise<{ id: string }> };

/** End an interview without submitting a diagnosis. */
export const POST = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id } = await params;
  await abandonSession(auth, id);
  return NextResponse.json({ ok: true });
});
