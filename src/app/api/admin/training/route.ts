import { NextResponse } from "next/server";
import { requireAdmin, route } from "@/lib/api/http";
import { listTrainingExamples } from "@/lib/services/training";

export const GET = route(async (request) => {
  await requireAdmin(request);
  return NextResponse.json({ examples: await listTrainingExamples() });
});
