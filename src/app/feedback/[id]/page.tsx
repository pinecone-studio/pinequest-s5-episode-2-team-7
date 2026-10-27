import type { Metadata } from "next";
import { ArrowUpCircle, CheckCircle2, ChevronLeft, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import { requirePageUser } from "@/lib/auth/server";
import { formatDateTime } from "@/lib/i18n";
import { difficultyLabel, modeLabel, scoreColor } from "@/lib/coach/labels";
import { resultDetail } from "@/lib/services/coach";

export const metadata: Metadata = { title: "Дүгнэлт" };

/** One AI дасгалжуулагч result in full: its owner, or the manager of the team it belongs to. */
export default async function ResultPage({ params }: PageProps<"/feedback/[id]">) {
  const { id } = await params;
  const session = await requirePageUser(`/feedback/${id}`);
  const d = await resultDetail(session.userId, id).catch(() => notFound());

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-5 py-8">
      <Link href="/feedback" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft size={16} aria-hidden /> Дүгнэлт
      </Link>

      <div className="flex items-center gap-4">
        <span className={cn("flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-full text-[34px] font-bold tabular-nums", scoreColor(d.score))}>{d.score}</span>
        <div>
          <h1 className="font-semibold text-ink">{d.packTitle}</h1>
          <p className="text-xs text-muted">
            {d.name} · {modeLabel(d.mode)} · {difficultyLabel(d.difficulty)}
          </p>
          <p className="text-xs text-subtle">{formatDateTime(d.createdAt)}</p>
        </div>
      </div>

      <p className="prose-mn text-ink">{d.debrief.summary}</p>

      <Section title="Шалгуурууд">
        {d.debrief.rubric.map((r) => (
          <div key={r.id} className="flex items-start gap-2">
            <span aria-label={r.result === "yes" ? "Хангасан" : r.result === "partial" ? "Хагас" : "Хангаагүй"}>{r.result === "yes" ? "✅" : r.result === "partial" ? "🟡" : "❌"}</span>
            <div>
              <p className="text-sm">{r.label}</p>
              <p className="text-xs text-muted">{r.evidence}</p>
            </div>
          </div>
        ))}
      </Section>
      <Section title="Сайн хийсэн">
        {d.debrief.strengths.map((s) => (
          <p key={s} className="flex gap-2 text-sm">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden /> {s}
          </p>
        ))}
      </Section>
      <Section title="Сайжруулах">
        {d.debrief.improvements.map((s) => (
          <p key={s} className="flex gap-2 text-sm">
            <ArrowUpCircle size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden /> {s}
          </p>
        ))}
      </Section>
      {d.debrief.betterLines.length > 0 && (
        <Section title="Ингэж хэлбэл илүү">
          {d.debrief.betterLines.map((b) => (
            <div key={b.said}>
              <p className="text-xs text-muted line-through">{b.said}</p>
              <p className="text-sm">→ {b.better}</p>
            </div>
          ))}
        </Section>
      )}
      {d.debrief.factErrors.length > 0 && (
        <Section title="Буруу мэдээлэл">
          {d.debrief.factErrors.map((s) => (
            <p key={s} className="flex gap-2 text-sm text-alert">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> {s}
            </p>
          ))}
        </Section>
      )}
      <details className="glass rounded-[20px] p-3.5">
        <summary className="cursor-pointer font-semibold">Ярианы тэмдэглэл</summary>
        <div className="mt-3 space-y-2">
          {d.transcript.map((line, i) => (
            <p key={i} className={cn("text-xs", line.role === "me" && "text-right")}>
              <span className="text-muted">{line.role === "me" ? "Ажилтан" : "AI"}:</span> {line.text}
            </p>
          ))}
        </div>
      </details>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass space-y-2 rounded-[20px] p-3.5">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}
