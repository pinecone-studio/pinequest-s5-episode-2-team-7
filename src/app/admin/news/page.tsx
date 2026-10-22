import type { Metadata } from "next";
import Link from "next/link";
import { NewsStatusSelect } from "@/components/admin/news-status-select";
import { Badge, buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { requirePageAdmin } from "@/lib/auth/server";
import { formatDateTime, NEWS_CATEGORY_LABELS } from "@/lib/i18n";
import { listAllNews } from "@/lib/services/news";

export const metadata: Metadata = { title: "Админ — Мэдээ" };

export default async function AdminNewsPage() {
  await requirePageAdmin("/admin/news");
  const news = await listAllNews();
  return (
    <main>
      <PageHeader
        title="Эрүүл мэндийн мэдээ"
        subtitle="Зөвхөн нийтлэгдсэн (published) мэдээ оюутанд харагдана."
        actions={
          <Link href="/admin/news/new" className={buttonClass("primary", "sm")}>
            Шинэ мэдээ
          </Link>
        }
      />
      {news.length === 0 ? (
        <EmptyState title="Мэдээ алга">«Шинэ мэдээ» товчоор эхний мэдээгээ нэмнэ үү.</EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Мэдээ</th>
                <th className="px-4 py-3 font-medium">Ангилал</th>
                <th className="px-4 py-3 font-medium">Төлөв</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {news.map((n) => (
                <tr key={n.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{n.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.updatedAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{NEWS_CATEGORY_LABELS[n.category] ?? n.category}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <NewsStatusSelect articleId={n.id} status={n.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/news/${n.id}`} className={buttonClass("secondary", "sm")}>
                      Засах
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </main>
  );
}
