import { NextResponse } from "next/server";
import { requireAdmin, route } from "@/lib/api/http";
import { exportCases } from "@/lib/services/cases";

/** Download cases as canonical JSON (?status=published|draft|archived). */
export const GET = route(async (request) => {
  await requireAdmin(request);
  const status = new URL(request.url).searchParams.get("status");
  const filter = status === "published" || status === "draft" || status === "archived" ? status : undefined;
  const data = await exportCases(filter);
  return new NextResponse(JSON.stringify({ cases: data }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pinequest-cases${filter ? `-${filter}` : ""}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
