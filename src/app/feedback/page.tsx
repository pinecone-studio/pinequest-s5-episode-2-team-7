import type { Metadata } from "next";
import { FeedbackList } from "@/components/feedback/feedback-list";
import { requirePageUser } from "@/lib/auth/server";
import { myResults } from "@/lib/services/coach";

export const metadata: Metadata = { title: "Дүгнэлт" };

export default async function FeedbackPage() {
  const session = await requirePageUser("/feedback");
  const results = await myResults(session.userId);
  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-5 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-white">Дүгнэлт</h1>
        <p className="mt-1.5 text-sm text-white/90">Хийсэн бүх дадлагын оноо, AI-ийн санал нэг дор.</p>
      </div>
      <FeedbackList results={results} />
    </main>
  );
}
