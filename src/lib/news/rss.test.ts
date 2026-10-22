import { describe, expect, it } from "vitest";
import { parseFeed, toPlainText } from "./rss";
import { parseTranslation } from "./translate";

const RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>Feed</title>
  <item>
    <title><![CDATA[Measles cases rise in <b>Europe</b>]]></title>
    <link>https://example.org/news/measles?a=1&amp;b=2</link>
    <description>&lt;p&gt;WHO urges &lt;strong&gt;vaccination&lt;/strong&gt; &amp;amp; surveillance.&lt;/p&gt;</description>
    <pubDate>Wed, 21 Oct 2026 22:40:01 EDT</pubDate>
  </item>
  <item>
    <title>Caf&#233; &#x2014; heart study</title>
    <link>https://example.org/news/heart</link>
    <pubDate>Sat, 10 Oct 2026 07:49:45 Z</pubDate>
  </item>
  <item><title>No link</title></item>
  <item><title>Bad link</title><link>javascript:alert(1)</link></item>
  <item><title>Undated</title><link>https://example.org/undated</link><pubDate>not a date</pubDate></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title type="html">New TB guideline</title>
    <link rel="self" href="https://example.org/self/1"/>
    <link rel="alternate" href="https://example.org/tb"/>
    <summary>Shorter treatment for &lt;i&gt;drug-resistant&lt;/i&gt; TB.</summary>
    <published>2026-10-20T08:00:00Z</published>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("reads RSS 2.0 items as plain text and drops items without a usable link", () => {
    const items = parseFeed(RSS);
    expect(items.map((i) => i.title)).toEqual(["Measles cases rise in Europe", "Café — heart study", "Undated"]);
    expect(items[0].link).toBe("https://example.org/news/measles?a=1&b=2");
    expect(items[0].description).toBe("WHO urges vaccination & surveillance.");
    expect(items[0].publishedAt?.toISOString()).toBe("2026-10-22T02:40:01.000Z");
    expect(items[1].publishedAt?.toISOString()).toBe("2026-10-10T07:49:45.000Z");
    expect(items[1].description).toBe("");
    expect(items[2].publishedAt).toBeNull();
  });

  it("reads Atom entries, preferring the alternate link", () => {
    const [entry] = parseFeed(ATOM);
    expect(entry).toEqual({
      title: "New TB guideline",
      link: "https://example.org/tb",
      description: "Shorter treatment for drug-resistant TB.",
      publishedAt: new Date("2026-10-20T08:00:00Z"),
    });
  });

  it("returns nothing for non-feed input", () => {
    expect(parseFeed("<!DOCTYPE html><html><body>Just a moment...</body></html>")).toEqual([]);
  });

  it("never lets markup through", () => {
    expect(toPlainText("&lt;script&gt;alert(1)&lt;/script&gt; ok")).toBe("alert(1) ok");
  });
});

describe("parseTranslation", () => {
  it("accepts fenced JSON and drops unknown categories", () => {
    expect(parseTranslation('```json\n{"title": "Улаанбурханы тохиолдол нэмэгдэв", "summary": "ДЭМБ вакцинжуулалтыг уриалав.", "category": "public-health"}\n```')).toEqual({
      title: "Улаанбурханы тохиолдол нэмэгдэв",
      summary: "ДЭМБ вакцинжуулалтыг уриалав.",
      category: "public-health",
    });
    expect(parseTranslation('{"title": "Гарчиг", "summary": "Товч агуулга.", "category": "sports"}').category).toBeNull();
  });

  it("rejects replies without a usable translation", () => {
    expect(() => parseTranslation("Уучлаарай, орчуулж чадсангүй.")).toThrow();
    expect(() => parseTranslation('{"title": "", "summary": "x"}')).toThrow();
  });
});
