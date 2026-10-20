import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/api/http";
import { getSessionView } from "@/lib/services/sessions";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id } = await params;
  return NextResponse.json({ session: await getSessionView(auth, id) });
});
