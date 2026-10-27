import type { Metadata } from "next";
import { KnowledgeList } from "@/components/practice/knowledge-list";

export const metadata: Metadata = { title: "Мэдлэг" };

export default function KnowledgePage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-5 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-white">Мэдлэг</h1>
        <p className="mt-1.5 text-sm text-white/90">Анатоми, яаралтай тусламж, лавлах мэдээлэл</p>
      </div>
      <KnowledgeList />
    </main>
  );
}
