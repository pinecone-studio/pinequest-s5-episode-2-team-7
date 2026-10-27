import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/api/http";
import { modelStatus } from "@/lib/coach/model-patient";

/** Is our fine-tuned patient model answering? Also nudges a sleeping GPU awake. */
export const GET = route(async (request) => {
  await requireUser(request);
  const { ok, detail } = await modelStatus();
  return NextResponse.json({ ok, detail });
});
