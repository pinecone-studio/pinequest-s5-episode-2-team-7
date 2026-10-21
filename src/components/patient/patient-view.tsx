"use client";

import { motion, useAnimationFrame, useMotionValue, useReducedMotion, type MotionValue } from "motion/react";
import { useRef } from "react";
import { t } from "@/i18n";
import { cn } from "../ui";
import { PatientAvatar, type Mood } from "./patient-avatar";

export type { Mood };
export { moodForCase } from "@/lib/mood";

/**
 * The patient "stage". Swap point for a 3D avatar later: keep these props
 * (who, mood, speaking/listening, audio level) and replace <PatientAvatar>
 * with a react-three-fiber canvas — nothing else on the screen changes.
 */
export interface PatientViewProps {
  sex: "male" | "female";
  age: number;
  mood: Mood;
  /** Patient is talking (reply being revealed or audio playing). */
  speaking: boolean;
  /** Student is recording a voice question. */
  listening?: boolean;
  /** 0..1 loudness: patient audio while speaking, mic input while listening. Synthesized when absent. */
  level?: MotionValue<number>;
  respiratoryRate?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = { sm: "h-11 w-11", md: "h-24 w-24", lg: "h-56 w-56 sm:h-64 sm:w-64" };
const BARS = 56;

export function PatientView({ sex, age, mood, speaking, listening = false, level, respiratoryRate, size = "lg", className }: PatientViewProps) {
  const reduce = useReducedMotion();
  const synthetic = useMotionValue(0);
  const active = speaking || listening;
  const source = level ?? synthetic;
  const ring = useRef<SVGGElement>(null);
  const smooth = useRef(0);

  useAnimationFrame((time) => {
    // Speech-like level when there is no real audio: syllable-rate wobble.
    if (!level) {
      const target = speaking && !reduce ? 0.35 + 0.35 * Math.sin(time / 90) * Math.sin(time / 233) + 0.3 * Math.abs(Math.sin(time / 61)) : 0;
      synthetic.set(Math.max(0, Math.min(1, target)));
    }
    if (size === "sm" || !ring.current) return;
    // Idle ring: nothing to update once it has settled.
    if (!active && smooth.current < 0.005) return;
    smooth.current += ((active ? source.get() : 0) - smooth.current) * 0.25;
    const bars = ring.current.children;
    for (let i = 0; i < bars.length; i++) {
      const wobble = reduce ? 0.5 : 0.55 + 0.45 * Math.sin(time / 140 + i * 0.9) * Math.cos(time / 310 + i * 0.37);
      const s = 0.08 + smooth.current * wobble;
      (bars[i] as SVGElement).setAttribute("transform", `rotate(${(i * 360) / BARS} 100 100) translate(100 ${100 - 92}) scale(1 ${s.toFixed(3)})`);
    }
  });

  return (
    <div className={cn("relative shrink-0", SIZES[size], className)}>
      {size !== "sm" && (
        <>
          {/* Soft halo */}
          <motion.div
            aria-hidden
            className={cn("absolute -inset-3 rounded-full blur-2xl", listening ? "bg-sky-400/30" : "bg-accent/25")}
            animate={{ opacity: active ? 1 : 0.35, scale: active ? 1.04 : 1 }}
            transition={{ duration: 0.5 }}
          />
          {/* Waveform ring */}
          <svg viewBox="0 0 200 200" className="absolute -inset-[9%] h-[118%] w-[118%] overflow-visible" aria-hidden>
            <motion.g ref={ring} animate={{ opacity: active ? 1 : 0 }} transition={{ duration: 0.3 }} className={listening ? "text-sky-400" : "text-accent"}>
              {Array.from({ length: BARS }, (_, i) => (
                <rect key={i} x="-1.4" y="-14" width="2.8" height="14" rx="1.4" fill="currentColor" transform={`rotate(${(i * 360) / BARS} 100 100) translate(100 8) scale(1 0.08)`} />
              ))}
            </motion.g>
          </svg>
        </>
      )}
      <div className="relative h-full w-full overflow-hidden rounded-full bg-gradient-to-b from-sky-100 to-brand-100 ring-4 ring-surface-solid dark:from-slate-700 dark:to-brand-900">
        <div className="absolute inset-x-0 bottom-0 top-[6%]">
          <PatientAvatar sex={sex} age={age} mood={mood} level={source} speaking={speaking} respiratoryRate={respiratoryRate} />
        </div>
      </div>
    </div>
  );
}

const MOOD_PAIN: Record<Mood, number> = { calm: 1, uneasy: 3, pain: 6, severe: 8 };

/** Mood/pain indicator under the avatar. */
export function MoodMeter({ mood }: { mood: Mood }) {
  const pain = MOOD_PAIN[mood];
  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-semibold text-muted">{t.consult.pain}</span>
        <span className={cn("rounded-full px-2 py-0.5 font-semibold", pain >= 6 ? "bg-alert-soft text-alert" : "bg-accent-soft text-accent")}>
          {t.consult.mood[mood]} · {pain}/10
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sunken">
        <motion.div
          className="h-full origin-left rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: pain / 10 }}
          transition={{ type: "spring", stiffness: 80, damping: 18, delay: 0.3 }}
        />
      </div>
    </div>
  );
}
