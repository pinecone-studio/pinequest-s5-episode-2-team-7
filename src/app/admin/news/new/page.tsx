import type { Metadata } from "next";
import { NewsForm } from "@/components/admin/news-form";
import { PageHeader } from "@/components/ui";
import { requirePageAdmin } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Админ — Шинэ мэдээ" };

export default async function AdminNewNewsPage() {
  await requirePageAdmin("/admin/news/new");
  return (
    <main>
      <PageHeader title="Шинэ мэдээ" subtitle="Мэдээ ноорог төлөвтэй үүснэ. Жагсаалтаас «Нийтлэгдсэн» болговол хэрэглэгчдэд харагдана." />
      <NewsForm />
    </main>
  );
}
