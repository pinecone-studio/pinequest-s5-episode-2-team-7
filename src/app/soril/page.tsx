import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { Shuulleg } from "@/components/shuulleg/shuulleg";
import { requirePageUser } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Сорил" };

/** «Сорил»: study material → AI exam → examiner-style feedback. `?topic=` comes from the ask bar on «Нүүр». */
export default async function SorilPage({ searchParams }: PageProps<"/soril">) {
  const { topic } = await searchParams;
  await requirePageUser(`/soril${typeof topic === "string" ? `?topic=${encodeURIComponent(topic)}` : ""}`);
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <PageHeader title="AI шүүлэгчид шалгуул" subtitle="Лекц, номын хуудас, заавар, тэмдэглэлээ оруул. AI шүүлэгч тест, өгүүлбэр, кейс бодлого зохиож, хариултыг чинь дүгнээд юуг дутуу, буруу хэлснийг хэлж өгнө." />
      <Shuulleg topic={typeof topic === "string" ? topic.slice(0, 500) : ""} />
    </main>
  );
}
