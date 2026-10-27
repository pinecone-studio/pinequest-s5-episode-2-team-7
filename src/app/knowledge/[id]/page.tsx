import type { Metadata } from "next";
import { Box, ChevronLeft, ClipboardList, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleIcon, TINTS } from "@/components/practice/article-icon";
import { buttonClass } from "@/components/ui";
import { findArticle, hasAtlas } from "@/lib/practice/knowledge";

export async function generateMetadata({ params }: PageProps<"/knowledge/[id]">): Promise<Metadata> {
  return { title: findArticle((await params).id)?.title ?? "Мэдлэг" };
}

/** One article (as `KnowledgeArticleView` in the iOS app): sections, key facts, quiz and 3D atlas. */
export default async function ArticlePage({ params }: PageProps<"/knowledge/[id]">) {
  const article = findArticle((await params).id);
  if (!article) notFound();
  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-5 py-8">
      <Link href="/knowledge" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft size={16} aria-hidden /> Мэдлэг
      </Link>
      <div className="flex items-center gap-3.5">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-accent-deep" style={{ background: TINTS[article.tint] }}>
          <ArticleIcon article={article} size={28} />
        </span>
        <h1 className="text-2xl font-bold">{article.title}</h1>
      </div>
      <p className="prose-mn">{article.summary}</p>
      {article.sections.map((section) => (
        <section key={section.heading} className="glass space-y-2 rounded-[20px] p-3.5">
          <h2 className="font-semibold">{section.heading}</h2>
          <ul className="space-y-1.5 text-sm">
            {section.points.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> {p}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className="space-y-1.5 rounded-[20px] bg-[#271c22]/90 p-3.5">
        <h2 className="flex items-center gap-1.5 font-semibold text-warn">
          <Star size={16} fill="currentColor" aria-hidden /> Санах зүйл
        </h2>
        {article.keyFacts.map((f) => (
          <p key={f} className="text-sm">
            {f}
          </p>
        ))}
      </section>
      <div className="space-y-2.5 pt-1">
        <Link href={`/soril?topic=${encodeURIComponent(article.quizTopic)}`} className={buttonClass("primary", "lg", "w-full")}>
          <ClipboardList size={18} aria-hidden /> Энэ сэдвээр Сорил өгөх
        </Link>
        {hasAtlas(article) && (
          <a href="/anatomy/index.html" className={buttonClass("secondary", "lg", "w-full")}>
            <Box size={18} aria-hidden /> 3D-ээр харах
          </a>
        )}
      </div>
    </main>
  );
}
