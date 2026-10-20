import { NextResponse } from "next/server";
import { requireAdmin, route } from "@/lib/api/http";
import { exportApprovedTraining } from "@/lib/services/training";

/** Approved transcripts as JSONL for `ml/` (`python -m pinequest_ml build --sessions <file>`). */
export const GET = route(async (request) => {
  await requireAdmin(request);
  const records = await exportApprovedTraining();
  const body = records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": 'attachment; filename="pinequest-approved-sessions.jsonl"',
      "Cache-Control": "no-store",
    },
  });
});
