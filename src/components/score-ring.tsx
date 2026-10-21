"use client";

import { motion } from "motion/react";
import { scoreTone } from "@/lib/score-tone";
import { CountUp } from "./motion/count-up";

/** Circular score that fills and counts up on mount. */
export function ScoreRing({ score, size = 112, label = "Нийт оноо" }: { score: number; size?: number; label?: string }) {
  const tone = scoreTone(score);
  const value = Math.max(0, Math.min(100, score));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${label}: ${Math.round(score)} / 100`} className="-rotate-90">
        <circle cx="50" cy="50" r="42" className="fill-none stroke-sunken" strokeWidth="9" />
        <motion.circle
          cx="50"
          cy="50"
          r="42"
          className={`fill-none ${tone.stroke}`}
          strokeWidth="9"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: value / 100 }}
          transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        />
      </svg>
      <span className={`absolute font-display font-extrabold tabular-nums ${tone.text}`} style={{ fontSize: size * 0.28 }} aria-hidden>
        <CountUp value={Math.round(score)} duration={1.6} delay={0.2} />
      </span>
    </div>
  );
}
