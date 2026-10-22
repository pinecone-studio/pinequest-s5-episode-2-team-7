/**
 * Minimal RSS 2.0 / Atom reader for news feeds. It only extracts the few
 * fields we store (title, link, short description, date) and never returns
 * HTML: every value is plain text.
 */

export interface FeedItem {
  title: string;
  link: string;
  description: string;
  publishedAt: Date | null;
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Feed text → plain text: unwrap CDATA, decode entities, drop tags, collapse whitespace. */
export function toPlainText(raw: string): string {
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Descriptions are often escaped HTML, so tags can only be removed after decoding.
  const decoded = decodeEntities(unwrapped);
  return decodeEntities(decoded.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function tagContent(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1] : null;
}

function atomLink(entry: string): string | null {
  const links = [...entry.matchAll(/<link\b([^>]*?)\/?>/gi)].map((m) => m[1]);
  const pick = links.find((attrs) => /rel=["']alternate["']/i.test(attrs)) ?? links.find((attrs) => !/rel=/i.test(attrs)) ?? links[0];
  const href = pick?.match(/href=["']([^"']+)["']/i)?.[1];
  return href ? decodeEntities(href) : null;
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const date = new Date(toPlainText(raw));
  return Number.isNaN(date.getTime()) ? null : date;
}

const isHttpUrl = (url: string) => /^https?:\/\/\S+$/i.test(url);

/** Items without a title or an http(s) link are dropped. */
export function parseFeed(xml: string): FeedItem[] {
  const blocks: { kind: "rss" | "atom"; xml: string }[] = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => ({ kind: "rss", xml: m[0] }));
  if (blocks.length === 0) blocks.push(...[...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => ({ kind: "atom" as const, xml: m[0] })));

  const items: FeedItem[] = [];
  for (const block of blocks) {
    const title = toPlainText(tagContent(block.xml, "title") ?? "");
    const link = block.kind === "rss" ? toPlainText(tagContent(block.xml, "link") ?? "") : (atomLink(block.xml) ?? "");
    if (!title || !isHttpUrl(link)) continue;
    const description = toPlainText(
      (block.kind === "rss" ? tagContent(block.xml, "description") : (tagContent(block.xml, "summary") ?? tagContent(block.xml, "content"))) ?? "",
    );
    const publishedAt =
      block.kind === "rss"
        ? parseDate(tagContent(block.xml, "pubDate") ?? tagContent(block.xml, "dc:date"))
        : parseDate(tagContent(block.xml, "published") ?? tagContent(block.xml, "updated"));
    items.push({ title, link, description, publishedAt });
  }
  return items;
}
