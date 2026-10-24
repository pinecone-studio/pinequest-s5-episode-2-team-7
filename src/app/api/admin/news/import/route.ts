import { NextResponse } from "next/server";
import { requireAdmin, route } from "@/lib/api/http";
import { getConfig } from "@/lib/config";
import { importNewsFromFeeds } from "@/lib/services/news-import";

export const maxDuration = 120;

/** Fetch RSS feeds now; new items are stored as translated drafts (published at once with NEWS_AUTO_PUBLISH=true). */
export const POST = route(async (request) => {
  await requireAdmin(request);
  return NextResponse.json(await importNewsFromFeeds({ publish: getConfig().NEWS_AUTO_PUBLISH === "true" }));
});
