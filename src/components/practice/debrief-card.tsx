"use client";

import { CheckCircle2, CircleAlert, CircleX, Gavel, HelpCircle, ListX } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { api } from "@/lib/api";
import type { Debrief } from "@/lib/evaluation/debrief";
import { ScoreRing } from "../score-ring";
import { Badge, Card, Skeleton } from "../ui";

const VERDICT = {
  correct: { tone: "emerald", icon: CheckCircle2 },
  partial: { tone: "amber", icon: CircleAlert },
  incorrect: { tone: "rose", icon: CircleX },
} as const;

const cacheKey = (sessionId: string) => `pq-debrief:${sessionId}`;

function readCache(sessionId: string): Debrief | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(sessionId));
    return raw ? (JSON.parse(raw) as Debrief) : null;
  } catch {
    return null;
  }
}

/** Loads the session's «Шүүлэгч» once per tab (cached), then shows it. */
export function SessionDebrief({ sessionId }: { sessionId: string }) {
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.resolve(readCache(sessionId) ?? api.debrief(sessionId))
      .then((d) => {
        if (!live) return;
        setDebrief(d);
        try {
          sessionStorage.setItem(cacheKey(sessionId), JSON.stringify(d));
        } catch {
          // Not cached: it is simply fetched again next time.
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [sessionId]);

  // The full report below still has the score and missed items.
  if (failed) return null;
  if (!debrief) {
    return (
      <Card className="mb-6 p-5" aria-busy>
        <p className="mb-3 text-sm text-muted">{t.practice.debrief.loading}</p>
        <Skeleton className="h-28 rounded-2xl" />
      </Card>
    );
  }
  return <DebriefCard debrief={debrief} />;
}

export function DebriefCard({ debrief }: { debrief: Debrief }) {
  const d = t.practice.debrief;
  const verdict = VERDICT[debrief.verdict];
  const VerdictIcon = verdict.icon;
  return (
    <Card className="mb-6 overflow-hidden p-0">
      <div className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:items-start sm:p-6">
        <ScoreRing score={debrief.score} label={d.score} />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="flex items-center justify-center gap-2 font-display text-lg font-bold sm:justify-start">
            <Gavel size={20} className="text-accent" aria-hidden /> {d.title}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <Badge tone={verdict.tone} className="px-3 py-1 text-sm">
              <VerdictIcon size={16} aria-hidden /> {d.verdict[debrief.verdict]}
            </Badge>
            <span className="text-sm text-muted">{debrief.expected}</span>
          </div>
          <p className="prose-mn mt-3 text-[15px] leading-relaxed">{debrief.summary}</p>
        </div>
      </div>

      <div className="grid gap-px bg-line sm:grid-cols-2">
        <section className="bg-surface-solid p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <ListX size={16} className="text-alert" aria-hidden /> {d.missed}
          </h3>
          {debrief.missed.length === 0 ? (
            <p className="text-sm text-muted">{d.noMissed}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {debrief.missed.slice(0, 6).map((m) => (
                <li key={m.label}>
                  <span className="font-semibold">
                    {m.label}
                    {m.critical && (
                      <Badge tone="rose" className="ml-1.5 align-middle">
                        !
                      </Badge>
                    )}
                  </span>
                  <span className="block text-muted">«{m.question}»</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="bg-surface-solid p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <HelpCircle size={16} className="text-accent" aria-hidden /> {d.followUps}
          </h3>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {debrief.followUps.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </section>
      </div>
    </Card>
  );
}
