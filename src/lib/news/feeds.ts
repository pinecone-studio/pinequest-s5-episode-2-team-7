import type { NewsCategory } from "@/lib/services/news";

export interface NewsFeed {
  name: string;
  url: string;
  /** Used when the translator does not pick a category. */
  category: NewsCategory;
}

/**
 * Public health-news feeds (all checked to return dated RSS on 2026-10-22).
 * Only the headline and the feed's own short description are translated and
 * stored, always with a link back to the original article; full articles are
 * never copied. Check each publisher's terms before adding a feed.
 * Not used: WHO's news feed (mostly undated, re-dated old items), NIH (blocks
 * automated requests), CDC (links point to a download page).
 */
export const NEWS_FEEDS: NewsFeed[] = [
  { name: "ScienceDaily", url: "https://www.sciencedaily.com/rss/health_medicine.xml", category: "research" },
  { name: "Medical Xpress", url: "https://medicalxpress.com/rss-feed/", category: "clinical" },
  { name: "The BMJ", url: "https://www.bmj.com/rss/recent.xml", category: "clinical" },
  { name: "The Lancet", url: "https://www.thelancet.com/rssfeed/lancet_current.xml", category: "research" },
];
