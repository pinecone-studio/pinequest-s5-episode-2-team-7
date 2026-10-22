import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, cn, EmptyState, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/auth/server";
import { formatDateTime, NEWS_CATEGORY_LABELS } from "@/lib/i18n";
import { isNewsCategory, listPublishedNews, NEWS_CATEGORIES } from "@/lib/services/news";

export const metadata: Metadata = { title: "Эрүүл мэндийн мэдээ" };

export default async function NewsPage({ searchParams }: PageProps<"/news">) {
  await requirePageUser("/news");
  const { category: raw } = await searchParams;
  const category = isNewsCategory(raw) ? raw : null;
  const news = await listPublishedNews(50, category ?? undefined);
  const chip = (active: boolean) =>
    cn("rounded-full px-3 py-1 text-sm transition-colors", active ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50");
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <PageHeader title="Эрүүл мэндийн мэдээ" subtitle="Эмчийн ур чадвараа хөгжүүлэхэд тустай сүүлийн үеийн мэдээ, судалгаа." />
      <nav aria-label="Ангилал" className="mb-5 flex flex-wrap gap-2">
        <Link href="/news" className={chip(category === null)} aria-current={category === null ? "page" : undefined}>
          Бүгд
        </Link>
        {NEWS_CATEGORIES.map((c) => (
          <Link key={c} href={`/news?category=${c}`} className={chip(category === c)} aria-current={category === c ? "page" : undefined}>
            {NEWS_CATEGORY_LABELS[c] ?? c}
          </Link>
        ))}
      </nav>
      {news.length === 0 ? (
        <EmptyState title={category ? "Энэ ангилалд мэдээ алга" : "Нийтлэгдсэн мэдээ алга"}>
          {category ? "Өөр ангилал сонгоно уу." : "Админ мэдээ нийтэлсний дараа энд харагдана."}
        </EmptyState>
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
