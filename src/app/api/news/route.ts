import { after, NextResponse } from "next/server";
import { route } from "@/lib/api/http";
import { getConfig } from "@/lib/config";
import { refreshNewsIfStale } from "@/lib/services/news-import";
import { listPublishedNews } from "@/lib/services/news";

/**
 * Published health news, newest first (`?category=` filters). Public: these are
 * short summaries with links to public sources, and the mobile app shows them
 * before the user signs in. With NEWS_AUTO_PUBLISH=true a stale or empty list
 * starts an import after the response is sent.
 */
export const GET = route(async (request) => {
  const category = new URL(request.url).searchParams.get("category") ?? undefined;
  const news = await listPublishedNews(50, category);
  if (getConfig().NEWS_AUTO_PUBLISH === "true" && !category) {
    const newest = news[0]?.publishedAt ? new Date(news[0].publishedAt) : null;
    after(() => refreshNewsIfStale(newest, news.length));
  }
  return NextResponse.json({ news, refreshing: news.length < 5 && getConfig().NEWS_AUTO_PUBLISH === "true" });
});
