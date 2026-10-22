import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/api/http";
import { listPublishedNews } from "@/lib/services/news";

/** Published health news, newest first. */
export const GET = route(async (request) => {
  await requireUser(request);
  return NextResponse.json({ news: await listPublishedNews() });
});
