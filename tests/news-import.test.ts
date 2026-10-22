import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as adminImport } from "@/app/api/admin/news/import/route";
import { GET as cronImport } from "@/app/api/cron/news-import/route";
import { POST as adminCreate } from "@/app/api/admin/news/route";
import { hashPassword } from "@/lib/auth/session";
import { resetConfigForTests } from "@/lib/config";
import { createPgliteDb, setDbForTests, type Db } from "@/lib/db/client";
import { newsArticles, users } from "@/lib/db/schema";
import type { NewsFeed } from "@/lib/news/feeds";
import type { NewsTranslator } from "@/lib/news/translate";
import { importNewsFromFeeds } from "@/lib/services/news-import";

const BASE = "http://localhost:3000";
const NOW = new Date("2026-10-22T00:00:00Z");
const noCtx = undefined as unknown;

function req(path: string, init: { method?: string; body?: unknown; cookie?: string; authorization?: string } = {}) {
  return new Request(`${BASE}${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...(init.authorization ? { authorization: init.authorization } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

function cookieFrom(response: Response): string {
  const match = (response.headers.get("set-cookie") ?? "").match(/pq_session=([^;]+)/);
  if (!match) throw new Error("no session cookie");
  return `pq_session=${match[1]}`;
}

const item = (slug: string, date: string) =>
  `<item><title>Story ${slug}</title><link>https://feed.test/${slug}</link><description>About ${slug}.</description><pubDate>${date}</pubDate></item>`;
const rss = (...items: string[]) => `<?xml version="1.0"?><rss version="2.0"><channel>${items.join("")}</channel></rss>`;

const FEEDS: NewsFeed[] = [
  { name: "Feed A", url: "https://a.test/rss", category: "research" },
  { name: "Feed B", url: "https://b.test/rss", category: "clinical" },
];

function fakeFetch(bodies: Record<string, string | number>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const body = bodies[String(input)];
    if (typeof body === "number") return new Response("down", { status: body });
    return new Response(body ?? "", { status: 200, headers: { "content-type": "application/rss+xml" } });
  }) as typeof fetch;
}

const fakeTranslator = () =>
  vi.fn<NewsTranslator>(async ({ title }) => ({ title: `МН: ${title}`, summary: `Товч: ${title}.`, category: title.endsWith("1") ? "public-health" : null }));

let db: Db;
let studentCookie: string;
let adminCookie: string;

beforeAll(async () => {
  db = await createPgliteDb("memory");
  setDbForTests(db);
  studentCookie = cookieFrom(await register(req("/api/auth/register", { body: { name: "Оюутан", email: "import-student@test.mn", password: "password123" } }), noCtx));
  await db.insert(users).values({ email: "import-admin@test.mn", name: "Админ", role: "admin", passwordHash: await hashPassword("adminpass123") });
  adminCookie = cookieFrom(await login(req("/api/auth/login", { body: { email: "import-admin@test.mn", password: "adminpass123" } }), noCtx));
});

afterAll(() => {
  delete process.env.CRON_SECRET;
  resetConfigForTests();
});

describe("news import", () => {
  it("translates new feed items into drafts and never duplicates them", async () => {
    const fetchImpl = fakeFetch({
      "https://a.test/rss": rss(item("a1", "Tue, 20 Oct 2026 10:00:00 GMT"), item("a2", "Wed, 21 Oct 2026 10:00:00 GMT"), item("old", "Mon, 01 Jun 2026 10:00:00 GMT")),
      "https://b.test/rss": rss(item("b1", "Wed, 21 Oct 2026 12:00:00 GMT")),
    });
    const translate = fakeTranslator();

    const first = await importNewsFromFeeds({ feeds: FEEDS, fetchImpl, translate, now: NOW });
    expect(first).toMatchObject({ created: 3, skipped: 0, failed: 0 });
    expect(translate).toHaveBeenCalledTimes(3); // the June item is too old

    const rows = await db.select().from(newsArticles);
    const a1 = rows.find((r) => r.sourceUrl === "https://feed.test/a1")!;
    expect(a1).toMatchObject({ title: "МН: Story a1", summary: "Товч: Story a1.", originalTitle: "Story a1", origin: "rss", status: "draft", sourceName: "Feed A", category: "public-health", publishedAt: null });
    expect(rows.find((r) => r.sourceUrl === "https://feed.test/a2")!.category).toBe("research"); // feed default

    // Re-running skips known links before translating them.
    const again = await importNewsFromFeeds({ feeds: FEEDS, fetchImpl, translate, now: NOW });
    expect(again).toMatchObject({ created: 0, skipped: 3, failed: 0 });
    expect(translate).toHaveBeenCalledTimes(3);
    expect(await db.$count(newsArticles)).toBe(3);
  });

  it("keeps going when a feed is down or a translation fails, and respects the translation limit", async () => {
    const fetchImpl = fakeFetch({
      "https://a.test/rss": 503,
      "https://b.test/rss": rss(item("c1", "Wed, 21 Oct 2026 10:00:00 GMT"), item("c2", "Wed, 21 Oct 2026 11:00:00 GMT"), item("c3", "Wed, 21 Oct 2026 12:00:00 GMT")),
    });
    const translate = vi.fn<NewsTranslator>(async ({ title }) => {
      if (title === "Story c3") throw new Error("quota");
      return { title: `МН: ${title}`, summary: "Товч агуулга.", category: null };
    });

    const result = await importNewsFromFeeds({ feeds: FEEDS, fetchImpl, translate, now: NOW, maxTotal: 2 });
    expect(result.feeds).toEqual([
      { name: "Feed A", ok: false, items: 0, error: "HTTP 503" },
      { name: "Feed B", ok: true, items: 3 },
    ]);
    // Newest first: c3 fails, c2 is stored, c1 waits for the next run.
    expect(result).toMatchObject({ created: 1, failed: 1, skipped: 1 });
    expect((await db.select().from(newsArticles)).some((r) => r.sourceUrl === "https://feed.test/c2")).toBe(true);
  });

  it("refuses to run without a translator", async () => {
    await expect(importNewsFromFeeds({ feeds: FEEDS, translate: null })).rejects.toMatchObject({ status: 503, code: "not_configured" });
  });

  it("rejects a manual article that repeats an existing source link", async () => {
    const response = await adminCreate(
      req("/api/admin/news", { body: { title: "Давхардсан", summary: "Товч.", body: "Агуулга.", sourceUrl: "https://feed.test/a1" }, cookie: adminCookie }),
      noCtx,
    );
    expect(response.status).toBe(409);
  });
});

describe("news import endpoints", () => {
  it("keeps the admin import away from students", async () => {
    expect((await adminImport(req("/api/admin/news/import", { method: "POST", cookie: studentCookie }), noCtx)).status).toBe(403);
    expect((await adminImport(req("/api/admin/news/import", { method: "POST" }), noCtx)).status).toBe(401);
  });

  it("only runs the cron import with the right CRON_SECRET", async () => {
    delete process.env.CRON_SECRET;
    resetConfigForTests();
    expect((await cronImport(req("/api/cron/news-import", { authorization: "Bearer " }), noCtx)).status).toBe(401);

    process.env.CRON_SECRET = "test-cron-secret-0123456789";
    resetConfigForTests();
    expect((await cronImport(req("/api/cron/news-import"), noCtx)).status).toBe(401);
    expect((await cronImport(req("/api/cron/news-import", { authorization: "Bearer wrong-secret-0123456789" }), noCtx)).status).toBe(401);
    // Authorized, but no GEMINI_API_KEY in tests: the request gets past auth and reports the missing key.
    delete process.env.GEMINI_API_KEY;
    resetConfigForTests();
    const ok = await cronImport(req("/api/cron/news-import", { authorization: "Bearer test-cron-secret-0123456789" }), noCtx);
    expect(ok.status).toBe(503);
    expect((await ok.json()).error.code).toBe("not_configured");
  });
});
