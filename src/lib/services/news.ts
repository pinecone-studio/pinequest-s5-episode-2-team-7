import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { Errors } from "@/lib/api/http";
import { getDb } from "@/lib/db/client";
import { newsArticles, type NewsArticleRow } from "@/lib/db/schema";

export type NewsStatus = "draft" | "published" | "archived";

export const NEWS_CATEGORIES = ["general", "research", "public-health", "clinical", "education"] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullish()
    .transform((v) => v ?? null);

export const NewsInput = z.object({
  title: z.string().trim().min(3, "Гарчиг дор хаяж 3 тэмдэгт байна.").max(200),
  summary: z.string().trim().min(3, "Товч агуулга оруулна уу.").max(500),
  body: z.string().trim().min(3, "Мэдээний агуулга оруулна уу.").max(20000),
  category: z.enum(NEWS_CATEGORIES).default("general"),
  sourceName: optionalText(120),
  sourceUrl: optionalText(500).refine((v) => v === null || /^https?:\/\//i.test(v), "Эх сурвалжийн холбоос http(s):// -ээр эхэлнэ."),
});
export type NewsInput = z.infer<typeof NewsInput>;

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  sourceName: string | null;
  sourceUrl: string | null;
  origin: "manual" | "rss";
  originalTitle: string | null;
  status: NewsStatus;
  publishedAt: string | null;
  updatedAt: string;
}

function toArticle(row: NewsArticleRow): NewsArticle {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    category: row.category,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    origin: row.origin,
    originalTitle: row.originalTitle,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const isNewsCategory = (value: unknown): value is NewsCategory => (NEWS_CATEGORIES as readonly unknown[]).includes(value);

/** Published articles, newest first; an unknown category means "all". */
export async function listPublishedNews(limit = 50, category?: string): Promise<NewsArticle[]> {
  const db = await getDb();
  const published = eq(newsArticles.status, "published");
  const rows = await db
    .select()
    .from(newsArticles)
    .where(isNewsCategory(category) ? and(published, eq(newsArticles.category, category)) : published)
    .orderBy(desc(newsArticles.publishedAt))
    .limit(limit);
  return rows.map(toArticle);
}

export async function getPublishedNews(id: string): Promise<NewsArticle> {
  const row = await findRow(id);
  if (!row || row.status !== "published") throw Errors.notFound("Мэдээ");
  return toArticle(row);
}

// ------------------------------------------------------------- admin ----

export async function listAllNews(): Promise<NewsArticle[]> {
  const db = await getDb();
  const rows = await db.select().from(newsArticles).orderBy(desc(newsArticles.updatedAt));
  return rows.map(toArticle);
}

export async function getNewsAdmin(id: string): Promise<NewsArticle> {
  const row = await findRow(id);
  if (!row) throw Errors.notFound("Мэдээ");
  return toArticle(row);
}

export async function createNews(input: unknown, userId: string | null): Promise<NewsArticle> {
  const data = NewsInput.parse(input);
  const db = await getDb();
  const [row] = await db
    .insert(newsArticles)
    .values({ ...data, createdBy: userId })
    .returning()
    .catch(rethrowDuplicateSource);
  return toArticle(row);
}

export async function updateNews(id: string, input: unknown): Promise<NewsArticle> {
  const data = NewsInput.parse(input);
  if (!isUuid(id)) throw Errors.notFound("Мэдээ");
  const db = await getDb();
  const [row] = await db
    .update(newsArticles)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(newsArticles.id, id))
    .returning()
    .catch(rethrowDuplicateSource);
  if (!row) throw Errors.notFound("Мэдээ");
  return toArticle(row);
}

/** `publishedAt` is set the first time an article is published and kept after that. */
export async function setNewsStatus(id: string, status: NewsStatus): Promise<NewsArticle> {
  const current = await findRow(id);
  if (!current) throw Errors.notFound("Мэдээ");
  const publishedAt = status === "published" ? (current.publishedAt ?? new Date()) : current.publishedAt;
  const db = await getDb();
  const [row] = await db.update(newsArticles).set({ status, publishedAt, updatedAt: new Date() }).where(eq(newsArticles.id, id)).returning();
  return toArticle(row);
}

export async function deleteNews(id: string): Promise<void> {
  if (!isUuid(id)) throw Errors.notFound("Мэдээ");
  const db = await getDb();
  const rows = await db.delete(newsArticles).where(eq(newsArticles.id, id)).returning({ id: newsArticles.id });
  if (rows.length === 0) throw Errors.notFound("Мэдээ");
}

/** sourceUrl is unique (imports rely on it to skip articles they already have). */
export function isUniqueViolation(error: unknown): boolean {
  for (let e = error; e instanceof Error; e = e.cause) {
    if ((e as { code?: string }).code === "23505" || /unique|duplicate/i.test(e.message)) return true;
  }
  return false;
}

function rethrowDuplicateSource(error: unknown): never {
  if (isUniqueViolation(error)) throw Errors.conflict("Энэ эх сурвалжийн холбоостой мэдээ аль хэдийн бүртгэлтэй байна.");
  throw error;
}

// A malformed id can never match a uuid column (and would make Postgres throw).
const isUuid = (id: string) => z.string().uuid().safeParse(id).success;

async function findRow(id: string): Promise<NewsArticleRow | undefined> {
  if (!isUuid(id)) return undefined;
  const db = await getDb();
  const [row] = await db.select().from(newsArticles).where(eq(newsArticles.id, id));
  return row;
}
