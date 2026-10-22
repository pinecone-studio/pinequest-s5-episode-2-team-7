import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewsForm } from "@/components/admin/news-form";
import { NewsStatusSelect } from "@/components/admin/news-status-select";
import { PageHeader } from "@/components/ui";
import { ApiError } from "@/lib/api/http";
import { requirePageAdmin } from "@/lib/auth/server";
import { getNewsAdmin } from "@/lib/services/news";

export const metadata: Metadata = { title: "Админ — Мэдээ засах" };

export default async function AdminNewsEditPage({ params }: PageProps<"/admin/news/[id]">) {
  const { id } = await params;
  await requirePageAdmin(`/admin/news/${id}`);
  let article;
  try {
    article = await getNewsAdmin(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  return (
    <main>
      <PageHeader title={article.title} actions={<NewsStatusSelect articleId={article.id} status={article.status} />} />
      <NewsForm
        articleId={article.id}
        initial={{
          title: article.title,
          summary: article.summary,
          body: article.body,
          category: article.category,
          sourceName: article.sourceName ?? "",
          sourceUrl: article.sourceUrl ?? "",
        }}
      />
    </main>
  );
}
