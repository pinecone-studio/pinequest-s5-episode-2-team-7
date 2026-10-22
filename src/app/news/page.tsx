import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/auth/server";
import { formatDateTime, NEWS_CATEGORY_LABELS } from "@/lib/i18n";
import { listPublishedNews } from "@/lib/services/news";

export const metadata: Metadata = { title: "Эрүүл мэндийн мэдээ" };

export default async function NewsPage() {
  await requirePageUser("/news");
  const news = await listPublishedNews();
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <PageHeader title="Эрүүл мэндийн мэдээ" subtitle="Эмчийн ур чадвараа хөгжүүлэхэд тустай сүүлийн үеийн мэдээ, судалгаа." />
      {news.length === 0 ? (
        <EmptyState title="Нийтлэгдсэн мэдээ алга">Админ мэдээ нийтэлсний дараа энд харагдана.</EmptyState>
      ) : (
        <div className="grid gap-4">
          {news.map((n) => (
            <Card key={n.id} className="p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="brand">{NEWS_CATEGORY_LABELS[n.category] ?? n.category}</Badge>
                {n.sourceName && <span className="text-xs text-slate-500">{n.sourceName}</span>}
                {n.publishedAt && <span className="text-xs text-slate-500">{formatDateTime(n.publishedAt)}</span>}
              </div>
              <h2 className="text-lg font-semibold leading-snug">
                <Link href={`/news/${n.id}`} className="hover:text-brand-700 hover:underline">
                  {n.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-slate-600">{n.summary}</p>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
