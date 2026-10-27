"use client";

import { ArrowRightLeft, Clock, Play, Star, Trophy } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { bestScore, scenarioHistory } from "@/lib/practice/history";
import type { Scenario } from "@/lib/practice/scenarios";
import { SceneWindow } from "./scene-window";

function useResults() {
  return useSyncExternalStore(scenarioHistory.subscribe, scenarioHistory.snapshot, scenarioHistory.serverSnapshot);
}

/** «Өнөөдрийн даалгавар»: the case of the day over its scene. */
export function FeaturedCase({ scenario }: { scenario: Scenario }) {
  const best = bestScore(useResults(), scenario.id);
  return (
    <Link href={`/cases/${scenario.id}`} className="relative block h-[210px] overflow-hidden rounded-[28px] ring-1 ring-line shadow-[0_8px_32px_rgb(0_0_0/0.45)]">
      <SceneWindow kind={scenario.scene} interactive={false} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70" />
      <span className="absolute right-3.5 top-3.5 rounded-full bg-accent-gradient px-4 py-2 text-sm font-semibold text-white">Эхлэх</span>
      <div className="absolute inset-x-4 bottom-4 space-y-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-gradient px-2.5 py-1 text-xs font-bold text-white">
          <Star size={12} fill="currentColor" aria-hidden /> Өнөөдрийн даалгавар
        </span>
        <p className="text-2xl font-bold text-white">{scenario.title}</p>
        <p className="flex flex-wrap gap-3 text-xs text-white/90">
          <span className="flex items-center gap-1">
            <Clock size={12} aria-hidden /> {scenario.minutes} мин
          </span>
          <span className="flex items-center gap-1">
            <ArrowRightLeft size={12} aria-hidden /> {scenario.steps.length} шийдвэр
          </span>
          {best !== null && (
            <span className="flex items-center gap-1">
              <Trophy size={12} aria-hidden /> Шилдэг {best}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}

export function CaseRow({ scenario }: { scenario: Scenario }) {
  const best = bestScore(useResults(), scenario.id);
  return (
    <Link href={`/cases/${scenario.id}`} className="glass flex items-center gap-3.5 rounded-3xl p-3">
      <SceneWindow kind={scenario.scene} interactive={false} className="relative h-[84px] w-[84px] shrink-0 rounded-[18px]" />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block font-semibold text-ink">{scenario.title}</span>
        <span className="block text-xs text-muted">{scenario.subtitle}</span>
        <span className="flex items-center gap-2 text-[11px] text-muted">
          <span className="flex gap-0.5" aria-label={`Хүндийн зэрэг ${scenario.difficulty}/3`}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={`h-1.5 w-1.5 rounded-full ${n <= scenario.difficulty ? "bg-accent" : "bg-subtle/40"}`} />
            ))}
          </span>
          {scenario.minutes} мин
          {best !== null && (
            <span className="flex items-center gap-0.5 font-semibold text-warn">
              <Trophy size={11} aria-hidden /> {best}
            </span>
          )}
        </span>
      </span>
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-accent-gradient text-white">
        <Play size={14} fill="currentColor" aria-hidden />
      </span>
    </Link>
  );
}
