import { NextResponse } from "next/server";
import { requireAdmin, route } from "@/lib/api/http";
import { providerDiagnostics } from "@/lib/services/diagnostics";

/** Active provider, model version and health — no secrets (admin only). */
export const GET = route(async (request) => {
  await requireAdmin(request);
  return NextResponse.json(await providerDiagnostics());
});
