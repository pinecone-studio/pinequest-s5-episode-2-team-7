"use client";

import { motion, useTransform, type MotionValue } from "motion/react";

import type { Mood } from "@/lib/mood";

export type { Mood };

interface AvatarProps {
  sex: "male" | "female";
  age: number;
  mood: Mood;
  /** 0..1 mouth opening while speaking. */
  level: MotionValue<number>;
  speaking: boolean;
  /** Breaths per minute — drives the breathing loop. */
  respiratoryRate?: number;
}

const SKIN = "#e8bf98";
const SKIN_SHADE = "#d6a57c";

/**
 * Flat SVG patient: breathes, blinks, and moves its mouth with `level`.
 * Expression (brows, eyes, mouth) follows `mood`. All motion is transform-only.
 */
export function PatientAvatar({ sex, age, mood, level, speaking, respiratoryRate = 16 }: AvatarProps) {
  const elderly = age >= 60;
  const hair = elderly ? "#b9bec6" : "#1f1a17";
  const mouthScale = useTransform(level, [0, 1], [0.15, 1]);
  const breathSeconds = Math.min(6, Math.max(1.8, 60 / respiratoryRate));
  const squint = mood === "pain" || mood === "severe";

  return (
    <svg viewBox="0 0 200 220" className="h-full w-full" role="img" aria-hidden>
      <g className="avatar-breathe" style={{ animationDuration: `${breathSeconds}s` }}>
        {/* Long hair sits behind the head. */}
        {sex === "female" && <path d="M52 92c0-40 22-62 48-62s48 22 48 62v58c-10 8-24 10-34 6H86c-10 4-24 2-34-6z" fill={hair} />}

        {/* Hospital gown */}
        <path d="M18 220c4-40 30-62 62-68h40c32 6 58 28 62 68z" fill="#8ec5e8" />
        <path d="M18 220c4-40 30-62 62-68h40c32 6 58 28 62 68z" fill="url(#gown-dots)" opacity="0.5" />
        <path d="M80 152l20 26 20-26" fill="none" stroke="#6aa9d3" strokeWidth="3" strokeLinejoin="round" />

        {/* Neck */}
        <path d="M86 126h28v30c-8 6-20 6-28 0z" fill={SKIN_SHADE} />

        {/* Ears + head */}
        <ellipse cx="55" cy="96" rx="8" ry="12" fill={SKIN_SHADE} />
        <ellipse cx="145" cy="96" rx="8" ry="12" fill={SKIN_SHADE} />
        <ellipse cx="100" cy="90" rx="45" ry="52" fill={SKIN} />

        {/* Hair on top */}
        {sex === "male" ? (
          elderly ? (
            <path d="M56 86c-2-16 2-26 10-32 0 10 4 16 4 26zM144 86c2-16-2-26-10-32 0 10-4 16-4 26z" fill={hair} />
          ) : (
            <path d="M55 84c-4-34 18-50 45-50s49 16 45 50c-6-14-14-22-26-24-12 6-36 6-50 0-8 4-12 12-14 24z" fill={hair} />
          )
        ) : (
          <path d="M55 88c-2-36 20-54 45-54s47 18 45 54c-14-4-30-16-36-30-8 14-30 26-54 30z" fill={hair} />
        )}
        {elderly && <path d="M76 66q24-6 48 0" fill="none" stroke={SKIN_SHADE} strokeWidth="1.6" strokeLinecap="round" />}

        {/* Cheeks: flushed when unwell */}
        <ellipse cx="74" cy="110" rx="9" ry="5" fill="#f08a7a" opacity={mood === "calm" ? 0.18 : 0.35} />
        <ellipse cx="126" cy="110" rx="9" ry="5" fill="#f08a7a" opacity={mood === "calm" ? 0.18 : 0.35} />

        <Brows mood={mood} />

        {/* Eyes (blink) */}
        <g className="avatar-blink">
          {squint ? (
            <>
              <path d="M74 93q8 4 16 0" fill="none" stroke="#2a2522" strokeWidth="3.2" strokeLinecap="round" />
              <path d="M110 93q8 4 16 0" fill="none" stroke="#2a2522" strokeWidth="3.2" strokeLinecap="round" />
            </>
          ) : (
            <>
              <ellipse cx="82" cy="93" rx="5" ry="5.6" fill="#2a2522" />
              <ellipse cx="118" cy="93" rx="5" ry="5.6" fill="#2a2522" />
              <circle cx="83.6" cy="91.2" r="1.5" fill="white" />
              <circle cx="119.6" cy="91.2" r="1.5" fill="white" />
            </>
          )}
        </g>

        {/* Nose */}
        <path d="M100 98q-4 10 0 13" fill="none" stroke={SKIN_SHADE} strokeWidth="2.4" strokeLinecap="round" />

        {/* Mouth: mood shape at rest, opening ellipse while speaking */}
        {speaking ? (
          <motion.ellipse cx="100" cy="123" rx="9" ry="7" fill="#7a2e2e" style={{ scaleY: mouthScale, transformBox: "fill-box", transformOrigin: "center" }} />
        ) : (
          <MoodMouth mood={mood} />
        )}

        {mood === "severe" && (
          <g className="avatar-sweat">
            <path d="M140 68q4 7 0 10q-4-3 0-10z" fill="#9fd4f5" />
          </g>
        )}
      </g>
      <defs>
        <pattern id="gown-dots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.6" fill="#ffffff" />
        </pattern>
      </defs>
    </svg>
  );
}

function Brows({ mood }: { mood: Mood }) {
  const common = { fill: "none", stroke: "#2a2522", strokeWidth: 3, strokeLinecap: "round" as const };
  switch (mood) {
    case "calm":
      return (
        <>
          <path d="M72 78q10-5 20 0" {...common} />
          <path d="M108 78q10-5 20 0" {...common} />
        </>
      );
    case "uneasy":
      // Inner ends raised: worried.
      return (
        <>
          <path d="M72 80q10-2 20-6" {...common} />
          <path d="M108 74q10 4 20 6" {...common} />
        </>
      );
    default:
      // Inner ends pulled down: pain.
      return (
        <>
          <path d="M72 76q10 2 20 6" {...common} />
          <path d="M108 82q10-4 20-6" {...common} />
        </>
      );
  }
}

function MoodMouth({ mood }: { mood: Mood }) {
  const common = { fill: "none", stroke: "#7a2e2e", strokeWidth: 3, strokeLinecap: "round" as const };
  if (mood === "calm") return <path d="M90 121q10 7 20 0" {...common} />;
  if (mood === "uneasy") return <path d="M90 124q10-2 20 0" {...common} />;
  if (mood === "pain") return <path d="M90 126q10-7 20 0" {...common} />;
  return <path d="M88 127q12-10 24 0z" fill="#7a2e2e" stroke="#7a2e2e" strokeWidth="2" strokeLinejoin="round" />;
}
