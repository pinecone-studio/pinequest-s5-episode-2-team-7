import { NextResponse } from "next/server";
import { Errors, requireAdmin, route } from "@/lib/api/http";
import { importCases } from "@/lib/services/cases";

const MAX_BYTES = 2_000_000;

/**
 * Import cases from JSON: a single case object, an array of cases, or
 * `{ "cases": [...] }`. Every item is validated; failures are reported per
 * item and imported cases start as drafts.
 */
export const POST = route(async (request) => {
  const auth = await requireAdmin(request);
  const text = await request.text();
  if (text.length > MAX_BYTES) throw Errors.badRequest("Файл хэт том байна (2MB-аас бага).");
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw Errors.badRequest(`JSON уншиж чадсангүй: ${(error as Error).message}`);
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "cases" in payload) {
    payload = (payload as { cases: unknown }).cases;
  }
  const report = await importCases(payload, auth.userId);
  const status = report.failed.length > 0 && report.created.length + report.updated.length === 0 ? 400 : 200;
  return NextResponse.json({ report }, { status });
});
