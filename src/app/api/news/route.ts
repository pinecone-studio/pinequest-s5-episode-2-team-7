import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/api/http";
import { listPublishedNews } from "@/lib/services/news";

/** Published health news, newest first (`?category=` filters). */
export const GET = route(async (request) => {
  await requireUser(request);
  const category = new URL(request.url).searchParams.get("category") ?? undefined;
  return NextResponse.json({ news: await listPublishedNews(50, category) });
});
