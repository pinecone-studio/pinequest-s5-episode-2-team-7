import { beforeAll, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as adminList, POST as adminCreate } from "@/app/api/admin/news/route";
import { DELETE as adminDelete, PATCH as adminPatch, PUT as adminUpdate } from "@/app/api/admin/news/[id]/route";
import { GET as listNews } from "@/app/api/news/route";
import { GET as getNews } from "@/app/api/news/[id]/route";
import { hashPassword } from "@/lib/auth/session";
import { createPgliteDb, setDbForTests } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

const BASE = "http://localhost:3000";

function req(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  return new Request(`${BASE}${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const noCtx = undefined as unknown;

function cookieFrom(response: Response): string {
  const match = (response.headers.get("set-cookie") ?? "").match(/pq_session=([^;]+)/);
  if (!match) throw new Error("no session cookie");
  return `pq_session=${match[1]}`;
}

const ARTICLE = { title: "Томуу ба томуутай төстэй өвчин", summary: "Улирлын томууноос урьдчилан сэргийлэх зөвлөмж.", body: "Эхний догол.\n\nХоёр дахь догол.", category: "public-health" };

let studentCookie: string;
let adminCookie: string;

beforeAll(async () => {
  const db = await createPgliteDb("memory");
  setDbForTests(db);
  const response = await register(req("/api/auth/register", { body: { name: "Оюутан", email: "news-student@test.mn", password: "password123" } }), noCtx);
  studentCookie = cookieFrom(response);
  await db.insert(users).values({ email: "news-admin@test.mn", name: "Админ", role: "admin", passwordHash: await hashPassword("adminpass123") });
  adminCookie = cookieFrom(await login(req("/api/auth/login", { body: { email: "news-admin@test.mn", password: "adminpass123" } }), noCtx));
});

async function createDraft(overrides: Record<string, unknown> = {}) {
  const response = await adminCreate(req("/api/admin/news", { body: { ...ARTICLE, ...overrides }, cookie: adminCookie }), noCtx);
  return { status: response.status, body: await response.json() };
}

describe("health news", () => {
  it("requires login to read news", async () => {
    expect((await listNews(req("/api/news"), noCtx)).status).toBe(401);
  });

  it("keeps admin endpoints away from students", async () => {
    expect((await adminList(req("/api/admin/news", { cookie: studentCookie }), noCtx)).status).toBe(403);
    expect((await adminCreate(req("/api/admin/news", { body: ARTICLE, cookie: studentCookie }), noCtx)).status).toBe(403);
  });

  it("hides drafts from students until published, then hides them again when archived", async () => {
    const { status, body } = await createDraft();
    expect(status).toBe(201);
    const id: string = body.article.id;
    expect(body.article.status).toBe("draft");
    expect(body.article.publishedAt).toBeNull();

    const draftList = await (await listNews(req("/api/news", { cookie: studentCookie }), noCtx)).json();
    expect(draftList.news.map((n: { id: string }) => n.id)).not.toContain(id);
    expect((await getNews(req(`/api/news/${id}`, { cookie: studentCookie }), ctx(id))).status).toBe(404);

    const published = await adminPatch(req(`/api/admin/news/${id}`, { method: "PATCH", body: { status: "published" }, cookie: adminCookie }), ctx(id));
    const publishedAt = (await published.json()).article.publishedAt;
    expect(publishedAt).toBeTruthy();

    const list = await (await listNews(req("/api/news", { cookie: studentCookie }), noCtx)).json();
    expect(list.news.map((n: { id: string }) => n.id)).toContain(id);
    expect((await getNews(req(`/api/news/${id}`, { cookie: studentCookie }), ctx(id))).status).toBe(200);

    await adminPatch(req(`/api/admin/news/${id}`, { method: "PATCH", body: { status: "archived" }, cookie: adminCookie }), ctx(id));
    expect((await getNews(req(`/api/news/${id}`, { cookie: studentCookie }), ctx(id))).status).toBe(404);

    // Re-publishing keeps the original publication date.
    const again = await adminPatch(req(`/api/admin/news/${id}`, { method: "PATCH", body: { status: "published" }, cookie: adminCookie }), ctx(id));
    expect((await again.json()).article.publishedAt).toBe(publishedAt);
  });

  it("filters published news by category and ignores unknown categories", async () => {
    const publish = async (category: string) => {
      const id: string = (await createDraft({ category })).body.article.id;
      await adminPatch(req(`/api/admin/news/${id}`, { method: "PATCH", body: { status: "published" }, cookie: adminCookie }), ctx(id));
      return id;
    };
    const research = await publish("research");
    const clinical = await publish("clinical");
    const ids = async (query: string) =>
      ((await (await listNews(req(`/api/news${query}`, { cookie: studentCookie }), noCtx)).json()).news as { id: string; category: string }[]);

    const filtered = await ids("?category=research");
    expect(filtered.map((n) => n.id)).toContain(research);
    expect(filtered.every((n) => n.category === "research")).toBe(true);
    expect((await ids("?category=bogus")).map((n) => n.id)).toEqual(expect.arrayContaining([research, clinical]));
  });

  it("validates input", async () => {
    expect((await createDraft({ title: "" })).status).toBe(400);
    expect((await createDraft({ sourceUrl: "javascript:alert(1)" })).status).toBe(400);
    const ok = await createDraft({ sourceName: "  ", sourceUrl: "" });
    expect(ok.status).toBe(201);
    expect(ok.body.article.sourceName).toBeNull();
    expect(ok.body.article.sourceUrl).toBeNull();
  });

  it("updates and deletes articles, and 404s on unknown or malformed ids", async () => {
    const id: string = (await createDraft()).body.article.id;
    const updated = await adminUpdate(req(`/api/admin/news/${id}`, { method: "PUT", body: { ...ARTICLE, title: "Шинэ гарчиг" }, cookie: adminCookie }), ctx(id));
    expect((await updated.json()).article.title).toBe("Шинэ гарчиг");

    expect((await adminDelete(req(`/api/admin/news/${id}`, { method: "DELETE", cookie: adminCookie }), ctx(id))).status).toBe(200);
    expect((await adminDelete(req(`/api/admin/news/${id}`, { method: "DELETE", cookie: adminCookie }), ctx(id))).status).toBe(404);
    expect((await getNews(req("/api/news/not-a-uuid", { cookie: studentCookie }), ctx("not-a-uuid"))).status).toBe(404);
    expect((await adminUpdate(req("/api/admin/news/not-a-uuid", { method: "PUT", body: ARTICLE, cookie: adminCookie }), ctx("not-a-uuid"))).status).toBe(404);
  });
});
