import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { Shuulleg } from "@/components/shuulleg/shuulleg";
import { requirePageUser } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Шүүлэг" };

/** «Шүүлэг»: study material → AI exam → examiner-style feedback. */
export default async function ShuullegPage() {
  await requirePageUser("/shuulleg");
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <PageHeader title="Шүүлэг" subtitle="Өөрийгөө AI багшаар шалгуул: асуулт, дүгнэлт, цааш нь юу судлах вэ." />
      <Shuulleg />
    </main>
  );
}
