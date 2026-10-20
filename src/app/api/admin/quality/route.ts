import { NextResponse } from "next/server";
import { requireAdmin, route } from "@/lib/api/http";
import { qualityReport } from "@/lib/services/quality";

export const GET = route(async (request) => {
  await requireAdmin(request);
  return NextResponse.json(await qualityReport());
});
