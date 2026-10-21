"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { cn } from "../ui";

/** One PQRST complex in a 100×40 box, baseline at y=24. */
const BEAT = "h14 q3 -4 6 0 h6 l3 3 l4 -22 l4 28 l3 -9 h8 q5 -7 10 0 h42";

function beats(count: number, start = 0, baseline = 24) {
  return `M${start} ${baseline} ` + Array.from({ length: count }, () => BEAT).join(" ");
}

/**
 * Scrolling ECG strip for the vitals monitor. The trace is a periodic SVG path
 * translated by CSS (GPU transform); its speed follows the heart rate.
 */
export function EcgStrip({ heartRate = 75, alarm = false, className }: { heartRate?: number; alarm?: boolean; className?: string }) {
  const fade = useId();
  const visibleBeats = 4;
  // One beat is 100 units wide; the path holds 2× the visible beats and scrolls by half.
  const seconds = (visibleBeats * 60) / Math.max(30, heartRate);
  return (
    <svg viewBox={`0 0 ${visibleBeats * 100} 40`} preserveAspectRatio="none" className={cn("w-full overflow-hidden", alarm ? "text-alert" : "text-ok", className ?? "h-12")} aria-hidden>
      <defs>
        <linearGradient id={fade} x1="0" x2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="0.25" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
      </defs>
      {/* The global reduced-motion rule stops this animation (no render-time branching, so SSR matches). */}
      <g style={{ animation: `ecg-scroll ${seconds.toFixed(2)}s linear infinite`, transformBox: "view-box" }}>
        <path d={beats(visibleBeats * 2)} fill="none" stroke={`url(#${fade})`} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

/** Hero heartbeat: a line drawn across the screen, then a glowing pulse travels along it. */
export function EcgHero({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const path = beats(6, 0, 24);
  const glow = useId();
  return (
    <svg viewBox="0 0 600 40" preserveAspectRatio="none" className={cn("w-full overflow-visible", className)} aria-hidden>
      <defs>
        <filter id={glow} x="-10%" y="-200%" width="120%" height="500%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <motion.path
        d={path}
        fill="none"
        className="stroke-accent/35"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 2.2, ease: "easeInOut" }}
      />
      {/* Travelling pulse: hidden for reduced motion via CSS. */}
      <motion.path
        d={path}
        fill="none"
        strokeWidth="2.6"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        filter={`url(#${glow})`}
        className="stroke-accent motion-reduce:hidden"
        initial={{ pathLength: 0.08, pathOffset: 0, opacity: 0 }}
        animate={{ pathOffset: [0, 0.92], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 3.4, ease: "linear", repeat: reduce ? 0 : Infinity, delay: 2, repeatDelay: 0.4 }}
      />
    </svg>
  );
}
