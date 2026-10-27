import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/api/http";
import { myResults } from "@/lib/services/coach";

/** The signed-in user's own practice results, newest first. */
export const GET = route(async (request) => {
  const auth = await requireUser(request);
  return NextResponse.json({ results: await myResults(auth.userId) });
});
