import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { ApiError } from "@/lib/api/http";
import { requirePageUser } from "@/lib/auth/server";
import { formatDateTime, NEWS_CATEGORY_LABELS } from "@/lib/i18n";
import { getPublishedNews } from "@/lib/services/news";

export const metadata: Metadata = { title: "Эрүүл мэндийн мэдээ" };

export default async function NewsArticlePage({ params }: PageProps<"/news/[id]">) {
  const { id } = await params;
  await requirePageUser(`/news/${id}`);
  let article;
  try {
    article = await getPublishedNews(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="mb-4 text-sm">
        <Link href="/news" className="font-medium text-brand-700 hover:underline">
          ← Бүх мэдээ
        </Link>
      </p>
      <Card className="p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone="brand">{NEWS_CATEGORY_LABELS[article.category] ?? article.category}</Badge>
          {article.publishedAt && <span className="text-xs text-slate-500">{formatDateTime(article.publishedAt)}</span>}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{article.title}</h1>
        <p className="mt-2 text-slate-600">{article.summary}</p>
        {/* Plain text only: rendered as paragraphs, never as HTML. */}
        <div className="mt-6 space-y-4 leading-relaxed text-slate-800">
          {article.body.split(/\n{2,}/).map((paragraph, i) => (
            <p key={i} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>
        {article.sourceName && (
          <p className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-500">
            Эх сурвалж:{" "}
            {article.sourceUrl ? (
              <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                {article.sourceName}
              </a>
            ) : (
              article.sourceName
            )}
          </p>
        )}
      </Card>
    </main>
  );
}
