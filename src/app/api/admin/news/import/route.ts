import { NextResponse } from "next/server";
import { requireAdmin, route } from "@/lib/api/http";
import { importNewsFromFeeds } from "@/lib/services/news-import";

export const maxDuration = 120;

/** Fetch RSS feeds now; new items are stored as translated drafts. */
export const POST = route(async (request) => {
  await requireAdmin(request);
  return NextResponse.json(await importNewsFromFeeds());
});
