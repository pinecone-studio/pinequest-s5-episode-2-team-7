"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SceneKind } from "@/lib/practice/scenarios";

const W = 400;
const H = 300;

/**
 * «Magic window»: an emergency scene drawn in depth layers (as `SceneWindow` in the
 * iOS app). Dragging, or tilting the phone once motion access is granted, moves
 * near layers more than far ones. Tapping the patient shows what you find.
 */
export function SceneWindow({
  kind,
  danger = 0,
  interactive = true,
  onPatient,
  className,
}: {
  kind: SceneKind;
  danger?: number;
  interactive?: boolean;
  onPatient?: () => void;
  className?: string;
}) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; base: { x: number; y: number } } | null>(null);
  const tiltBase = useRef<{ beta: number; gamma: number } | null>(null);

  useEffect(() => {
    if (!interactive) return;
    function onTilt(e: DeviceOrientationEvent) {
      if (e.beta === null || e.gamma === null) return;
      tiltBase.current ??= { beta: e.beta, gamma: e.gamma };
      // ~25° of tilt pans from the centre to the edge.
      const x = Math.max(-1, Math.min(1, (e.gamma - tiltBase.current.gamma) / 25));
      const y = Math.max(-1, Math.min(1, (e.beta - tiltBase.current.beta) / 25));
      if (!drag.current) setPan({ x: x * W * 0.18, y: y * H * 0.06 });
    }
    window.addEventListener("deviceorientation", onTilt);
    return () => window.removeEventListener("deviceorientation", onTilt);
  }, [interactive]);

  /** `depth` 0 = horizon (barely moves) … 1 = closest (moves the most). */
  const layer = (depth: number, children: ReactNode) => <g transform={`translate(${pan.x * (0.25 + depth)} ${pan.y * (0.25 + depth)})`}>{children}</g>;
  const patient = (x: number, y: number, color: string, scale = 1) => (
    <g
      transform={`translate(${x} ${y}) scale(${scale})`}
      role={onPatient ? "button" : undefined}
      aria-label={onPatient ? "Өвчтөнийг үзэх" : undefined}
      tabIndex={onPatient ? 0 : undefined}
      onClick={onPatient}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPatient?.()}
      className={onPatient ? "cursor-pointer outline-none" : undefined}
    >
      {onPatient && <circle r="34" fill="none" stroke="#8b5cf6" strokeWidth="2.5" className="scene-ping" />}
      {/* Seated figure */}
      <circle cx="0" cy="-22" r="8" fill={color} />
      <path d="M-7 -12 h14 l3 18 h10 v8 h-16 l-4 -8 h-7 z" fill={color} />
      <path d="M-7 -10 l-8 14" stroke={color} strokeWidth="5" strokeLinecap="round" />
    </g>
  );

  return (
    <div
      className={`touch-none select-none overflow-hidden ${className ?? "relative"}`}
      onPointerDown={(e) => interactive && (drag.current = { x: e.clientX, y: e.clientY, base: pan })}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const limit = W * 0.3;
        setPan({
          x: Math.max(-limit, Math.min(limit, drag.current.base.x + (e.clientX - drag.current.x) * 0.6)),
          y: Math.max(-40, Math.min(40, drag.current.base.y + (e.clientY - drag.current.y) * 0.2)),
        });
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="h-full w-full" aria-hidden={!onPatient}>
        {kind === "roadAccident" && (
          <>
            <defs>
              <linearGradient id="night" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#0b1030" />
                <stop offset="0.55" stopColor="#2a1f5c" />
                <stop offset="1" stopColor="#6b4a8e" />
              </linearGradient>
              <linearGradient id="road" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2b2b38" />
                <stop offset="1" stopColor="#15151c" />
              </linearGradient>
            </defs>
            <rect x="-200" y="-50" width="800" height="400" fill="url(#night)" />
            {layer(
              0,
              <>
                {Array.from({ length: 24 }, (_, i) => (
                  <circle key={i} cx={((i * 137) % 100) * 6.4 - 120} cy={((i * 59) % 45) * 3} r={0.6 + (i % 3) * 0.5} fill="#fff" opacity={0.5 + (i % 3) * 0.15} />
                ))}
                <circle cx="328" cy="42" r="17" fill="#fff4d6" style={{ filter: "drop-shadow(0 0 12px #fff4d6)" }} />
              </>,
            )}
            {layer(
              0.15,
              Array.from({ length: 18 }, (_, i) => {
                const w = 18 + ((i * 7) % 22);
                const h = 30 + ((i * 23) % 70);
                const x = -140 + i * 38;
                return (
                  <g key={i}>
                    <rect x={x} y={150 - h} width={w} height={h} fill="#1a1440" />
                    <rect x={x + 6} y={150 - h + 8} width="4" height="4" fill="#ffd27a" opacity={i % 3 === 0 ? 0.7 : 0.15} />
                  </g>
                );
              }),
            )}
            {layer(
              0.35,
              <>
                <rect x="-200" y="168" width="800" height="150" fill="url(#road)" />
                {Array.from({ length: 14 }, (_, i) => (
                  <rect key={i} x={-180 + i * 70} y="226" width="34" height="4" rx="2" fill="#f2d16b" opacity="0.8" />
                ))}
              </>,
            )}
            {layer(
              0.4,
              <>
                <circle cx="100" cy="168" r="45" fill="#ef4444" className="scene-flash-a" style={{ filter: "blur(28px)" }} />
                <circle cx="300" cy="168" r="45" fill="#3b82f6" className="scene-flash-b" style={{ filter: "blur(28px)" }} />
              </>,
            )}
            {layer(
              0.55,
              <>
                <Car x={48} y={186} color="#8a93a8" flip />
                {[0, 1, 2].map((i) => (
                  <path key={i} d={`M${144 + i * 32} 218 l7 -18 l7 18 z`} fill="#ff8a3d" />
                ))}
              </>,
            )}
            {layer(
              0.75,
              <g transform="rotate(-10 312 198)">
                <ellipse cx="322" cy="150" rx="34" ry="18" fill="#9ca3af" opacity="0.5" className="scene-smoke" style={{ filter: "blur(6px)" }} />
                <Car x={312} y={198} color="#c0393b" big />
                <path d="M350 182 q6 -14 0 -22 q10 8 6 22 z" fill="#fb923c" className="scene-flash-a" />
              </g>,
            )}
            {layer(1, patient(180, 252, "#ffffff", 1.1))}
          </>
        )}

        {kind === "emergencyRoom" && (
          <>
            <rect x="-200" y="-50" width="800" height="400" fill="#cfdde9" />
            {layer(
              0.05,
              <>
                <rect x="30" y="45" width="128" height="66" rx="6" fill="#a9c7e4" stroke="#fff" strokeWidth="4" />
                <rect x="228" y="24" width="128" height="22" rx="11" fill="#d64545" />
                <text x="292" y="39" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">
                  ЯАРАЛТАЙ ТУСЛАМЖ
                </text>
              </>,
            )}
            {layer(0.3, <rect x="-200" y="200" width="800" height="150" fill="#9fb3c4" />)}
            {layer(
              0.45,
              <g transform="translate(232 82)">
                <Monitor danger={danger} />
              </g>,
            )}
            {layer(
              0.6,
              <>
                <path d="M40 84 q6 -10 12 0 a6 6 0 1 1 -12 0 z" fill="#7fb6e8" />
                <rect x="44" y="94" width="3" height="110" fill="#6b7a89" />
              </>,
            )}
            {layer(
              0.9,
              <>
                <rect x="110" y="196" width="150" height="20" rx="6" fill="#f5f7fa" style={{ filter: "drop-shadow(0 6px 6px rgb(0 0 0 / 0.15))" }} />
                <rect x="110" y="178" width="34" height="22" rx="6" fill="#ffffff" />
                <rect x="116" y="216" width="6" height="30" fill="#9aa8b6" />
                <rect x="248" y="216" width="6" height="30" fill="#9aa8b6" />
                {patient(176, 180, "#3c5a78")}
              </>,
            )}
          </>
        )}

        {kind === "clinic" && (
          <>
            <rect x="-200" y="-50" width="800" height="400" fill="#ece3f5" />
            {layer(
              0.05,
              <>
                <rect x="216" y="40" width="144" height="78" rx="8" fill="#cfe6f7" stroke="#fff" strokeWidth="5" />
                <rect x="48" y="44" width="28" height="22" rx="4" fill="#d64545" />
                <path d="M62 48 v14 M55 55 h14" stroke="#fff" strokeWidth="4" />
              </>,
            )}
            {layer(0.3, <rect x="-200" y="206" width="800" height="150" fill="#cdbfdc" />)}
            {layer(
              0.55,
              <>
                <rect x="290" y="184" width="96" height="10" rx="4" fill="#fff" />
                <path d="M318 172 h40 M350 166 v12" stroke="#6c63c9" strokeWidth="5" strokeLinecap="round" />
              </>,
            )}
            {layer(
              0.9,
              <>
                <rect x="140" y="196" width="60" height="12" rx="4" fill="#8c7bb0" />
                <rect x="186" y="150" width="12" height="56" rx="4" fill="#8c7bb0" />
                <rect x="144" y="208" width="6" height="34" fill="#8c7bb0" />
                <rect x="190" y="208" width="6" height="34" fill="#8c7bb0" />
                {patient(168, 194, "#7a3b5a", 1.15)}
              </>,
            )}
          </>
        )}
      </svg>
      {/* Deterioration: a red vignette that pulses as the patient gets worse. */}
      {danger > 0.2 && (
        <div
          aria-hidden
          className="scene-danger pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(circle, transparent 35%, rgb(239 68 68 / ${0.15 + 0.45 * danger}))` }}
        />
      )}
    </div>
  );
}

function Car({ x, y, color, flip = false, big = false }: { x: number; y: number; color: string; flip?: boolean; big?: boolean }) {
  const s = big ? 1.4 : 1;
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <path d="M-34 0 v-12 q0 -4 4 -5 l12 -3 l8 -10 h24 l10 10 l8 2 q4 1 4 5 v13 z" fill={color} />
      <path d="M-12 -21 l6 -7 h10 v7 z M8 -21 v-7 h8 l6 7 z" fill="#cbd5e1" opacity="0.8" />
      <circle cx="-20" cy="0" r="6" fill="#1f2937" />
      <circle cx="22" cy="0" r="6" fill="#1f2937" />
    </g>
  );
}

/** A small bedside monitor with a moving ECG trace. */
function Monitor({ danger }: { danger: number }) {
  const fast = danger > 0.3;
  // One beat of P-QRS-T, repeated; the strip scrolls with CSS.
  const beat = (o: number) => `L${o + 10} 30 L${o + 13} 26 L${o + 16} 30 L${o + 19} 30 L${o + 20} 33 L${o + 22} 10 L${o + 24} 37 L${o + 26} 30 L${o + 32} 30 L${o + 35} 25 L${o + 38} 30 L${o + 40} 30`;
  const d = `M0 30 ${Array.from({ length: 8 }, (_, i) => beat(i * 40)).join(" ")}`;
  return (
    <g>
      <rect width="120" height="66" rx="8" fill="#0e1a24" stroke="#5c6b78" strokeWidth="3" />
      <svg x="6" y="6" width="108" height="54" viewBox="0 0 160 54">
        <path d={d} fill="none" stroke={danger > 0.5 ? "#ef4444" : "#22c55e"} strokeWidth="2" className={fast ? "scene-ecg-fast" : "scene-ecg"} />
      </svg>
    </g>
  );
}
