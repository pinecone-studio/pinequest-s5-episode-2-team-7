"use client";

import { ChevronRight, PersonStanding, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn, inputClass } from "@/components/ui";
import { ARTICLES, type KnowledgeArticle } from "@/lib/practice/knowledge";
import { ArticleIcon, TINTS } from "./article-icon";

function matches(a: KnowledgeArticle, q: string) {
  const has = (s: string) => s.toLowerCase().includes(q);
  return has(a.title) || has(a.summary) || a.keyFacts.some(has) || a.sections.some((s) => has(s.heading) || s.points.some(has));
}

/** «Мэдлэг»: search, the 3D atlas and the articles by kind (as `KnowledgeView` in the iOS app). */
export function KnowledgeList() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = q ? ARTICLES.filter((a) => matches(a, q)) : ARTICLES;
  const of = (kind: KnowledgeArticle["kind"]) => list.filter((a) => a.kind === kind);

  return (
    <div className="space-y-6">
      <label className="relative block">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
        <span className="sr-only">Хайх</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Хайх: зүрх, шок, SpO₂…" className={cn(inputClass, "h-12 rounded-full pl-10")} />
      </label>

      {!q && (
        <a href="/anatomy/index.html" className="glass flex items-center gap-4 rounded-[26px] p-3.5">
          <span className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-[22px] bg-accent-gradient text-white">
            <PersonStanding size={40} aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block text-lg font-semibold">3D Анатоми</span>
            <span className="block text-xs text-muted">2,234 хэсгийг эргүүлж, задалж, монгол нэрээр хайх</span>
          </span>
          <ChevronRight className="text-subtle" aria-hidden />
        </a>
      )}

      {list.length === 0 && <p className="text-muted">Илэрц олдсонгүй.</p>}

      {of("anatomy").length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Биеийн системүүд</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {of("anatomy").map((a) => (
              <Link key={a.id} href={`/knowledge/${a.id}`} className="space-y-2.5 rounded-[22px] p-3.5 ring-1 ring-line" style={{ background: TINTS[a.tint] }}>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-accent">
                  <ArticleIcon article={a} />
                </span>
                <span className="line-clamp-2 block text-sm font-semibold">{a.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {(
        [
          ["emergency", "Яаралтай тусламж"],
          ["reference", "Лавлах"],
        ] as const
      ).map(
        ([kind, title]) =>
          of(kind).length > 0 && (
            <section key={kind} className="space-y-2.5">
              <h2 className="text-lg font-semibold">{title}</h2>
              {of(kind).map((a) => (
                <ArticleRow key={a.id} article={a} />
              ))}
            </section>
          ),
      )}
      <p className="text-[11px] text-muted">⚠️ Сургалтын товч мэдээлэл. Эмнэлзүйн шийдвэрт албан ёсны заавар, багшийн зөвлөгөөг баримтал.</p>
    </div>
  );
}

function ArticleRow({ article }: { article: KnowledgeArticle }) {
  return (
    <Link href={`/knowledge/${article.id}`} className="glass flex items-center gap-3 rounded-[22px] p-3">
      <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full text-accent-deep" style={{ background: TINTS[article.tint] }}>
        <ArticleIcon article={article} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{article.title}</span>
        <span className="line-clamp-2 text-xs text-muted">{article.summary}</span>
      </span>
      <ChevronRight size={16} className="text-subtle" aria-hidden />
    </Link>
  );
}
