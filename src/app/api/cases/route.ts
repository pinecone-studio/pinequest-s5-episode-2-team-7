import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/api/http";
import { listPublishedCases } from "@/lib/services/cases";

/** Published cases — public fields only (no diagnosis or hidden facts). */
export const GET = route(async (request) => {
  await requireUser(request);
  return NextResponse.json({ cases: await listPublishedCases() });
});
