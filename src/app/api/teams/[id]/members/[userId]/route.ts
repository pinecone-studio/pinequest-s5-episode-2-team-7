import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/api/http";
import { memberProgress } from "@/lib/services/coach";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/** Team owner: one employee's progress (scores over time, weak criteria, challenges, results). */
export const GET = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id, userId } = await params;
  return NextResponse.json(await memberProgress(auth.userId, id, userId));
});
