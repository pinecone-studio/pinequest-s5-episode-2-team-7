import "server-only";
import { inArray } from "drizzle-orm";
import { ApiError } from "@/lib/api/http";
import { getDb } from "@/lib/db/client";
import { newsArticles } from "@/lib/db/schema";
import { NEWS_FEEDS, type NewsFeed } from "@/lib/news/feeds";
import { parseFeed, type FeedItem } from "@/lib/news/rss";
import { getNewsTranslator, type NewsTranslator } from "@/lib/news/translate";

export interface ImportOptions {
  translate?: NewsTranslator | null;
  feeds?: NewsFeed[];
  fetchImpl?: typeof fetch;
  /** Newest items considered per feed. */
  limitPerFeed?: number;
  /** Translations per run (keeps Gemini free-tier quota and run time bounded). */
  maxTotal?: number;
  /** Older (or undated) items are ignored. */
  maxAgeDays?: number;
  now?: Date;
}

export interface FeedResult {
  name: string;
  ok: boolean;
  items: number;
  error?: string;
}

export interface ImportResult {
  created: number;
  /** Already imported, or over this run's translation limit. */
  skipped: number;
  /** Translation failed; retried on the next run. */
  failed: number;
  feeds: FeedResult[];
}

const FEED_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

async function fetchFeed(feed: NewsFeed, fetchImpl: typeof fetch): Promise<FeedItem[]> {
  const response = await fetchImpl(feed.url, {
    headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml", "user-agent": "PineQuestNews/1.0 (+health news digest)" },
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseFeed(await response.text());
}

const bodyFor = (sourceName: string) =>
  `Энэ нь ${sourceName}-ийн мэдээний гарчиг, товчийг монгол хэл рүү машинаар орчуулсан хувилбар. Бүтэн мэдээг эх сурвалжаас уншина уу.`;

/**
 * Fetch the configured feeds, translate new items to Mongolian and store them
 * as drafts (an admin reviews and publishes). Items already stored (same
 * sourceUrl) are skipped before translation, so re-runs cost nothing. One
 * failing feed or translation never stops the rest.
 */
export async function importNewsFromFeeds(options: ImportOptions = {}): Promise<ImportResult> {
  const translate = options.translate === undefined ? getNewsTranslator() : options.translate;
  if (!translate) throw new ApiError(503, "not_configured", "Мэдээ орчуулахын тулд GEMINI_API_KEY тохируулна уу.");
  const { feeds = NEWS_FEEDS, fetchImpl = fetch, limitPerFeed = 5, maxTotal = 10, maxAgeDays = 30, now = new Date() } = options;
  const oldest = now.getTime() - maxAgeDays * DAY_MS;

  const result: ImportResult = { created: 0, skipped: 0, failed: 0, feeds: [] };
  const candidates: { feed: NewsFeed; item: FeedItem }[] = [];
  const seen = new Set<string>();
  for (const feed of feeds) {
    try {
      const items = (await fetchFeed(feed, fetchImpl))
        .filter((i) => i.publishedAt && i.publishedAt.getTime() >= oldest && !seen.has(i.link))
        .sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime())
        .slice(0, limitPerFeed);
      items.forEach((item) => {
        seen.add(item.link);
        candidates.push({ feed, item });
      });
      result.feeds.push({ name: feed.name, ok: true, items: items.length });
    } catch (error) {
      const message = error instanceof Error ? (error.name === "TimeoutError" ? "timeout" : error.message) : "error";
      console.warn(`[news] feed ${feed.name} failed: ${message}`);
      result.feeds.push({ name: feed.name, ok: false, items: 0, error: message.slice(0, 200) });
    }
  }
  if (candidates.length === 0) return result;

  const db = await getDb();
  const existing = new Set(
    (await db.select({ url: newsArticles.sourceUrl }).from(newsArticles).where(inArray(newsArticles.sourceUrl, [...seen]))).map((r) => r.url),
  );

  let translated = 0;
  for (const { feed, item } of candidates) {
    if (existing.has(item.link) || translated >= maxTotal) {
      result.skipped++;
      continue;
    }
    translated++;
    let translation;
    try {
      translation = await translate({ title: item.title, description: item.description, sourceName: feed.name });
    } catch (error) {
      console.warn(`[news] translation failed for ${item.link}: ${error instanceof Error ? error.message : error}`);
      result.failed++;
      continue;
    }
    const inserted = await db
      .insert(newsArticles)
      .values({
        title: translation.title,
        summary: translation.summary,
        body: bodyFor(feed.name),
        category: translation.category ?? feed.category,
        sourceName: feed.name,
        sourceUrl: item.link,
        origin: "rss",
        originalTitle: item.title.slice(0, 500),
        status: "draft",
      })
      // A concurrent run may have stored the same link meanwhile.
      .onConflictDoNothing({ target: newsArticles.sourceUrl })
      .returning({ id: newsArticles.id });
    if (inserted.length > 0) result.created++;
    else result.skipped++;
  }
  return result;
}
