"use client";

import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { Activity, Droplets, HeartPulse, Thermometer, Wind } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { t } from "@/i18n";
import type { PublicCase } from "@/lib/views";
import { EcgStrip } from "../motion/ecg";
import { cn } from "../ui";

type Vitals = NonNullable<PublicCase["initialVitals"]>;

interface Live {
  hr?: number;
  sys?: number;
  dia?: number;
  rr?: number;
  temp?: number;
  spo2?: number;
}

function parseBp(bp?: string): [number, number] | [undefined, undefined] {
  const m = bp?.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  return m ? [Number(m[1]), Number(m[2])] : [undefined, undefined];
}

const jitter = (base: number | undefined, spread: number, min: number, max: number) =>
  base === undefined ? undefined : Math.max(min, Math.min(max, base + (Math.random() * 2 - 1) * spread));

/** Adult reference ranges for highlighting (teaching aid, not clinical thresholds). */
export const abnormal = {
  hr: (v: number) => v < 50 || v > 100,
  sys: (v: number) => v < 90 || v >= 140,
  dia: (v: number) => v >= 90,
  rr: (v: number) => v < 10 || v > 20,
  temp: (v: number) => v < 35.5 || v >= 37.8,
  spo2: (v: number) => v < 94,
};

/**
 * Bedside monitor. Values drift slightly around the case's initial vitals so
 * the screen feels alive; they never trend (the API has no live vitals).
 */
export function VitalsMonitor({ vitals, compact = false }: { vitals?: Vitals; compact?: boolean }) {
  const reduce = useReducedMotion();
  const [sys0, dia0] = parseBp(vitals?.bloodPressure);
  const base: Live = { hr: vitals?.heartRate, sys: sys0, dia: dia0, rr: vitals?.respiratoryRate, temp: vitals?.temperatureC, spo2: vitals?.spo2 };
  const [live, setLive] = useState<Live>(base);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setLive({
        hr: jitter(base.hr, 2.5, 30, 220),
        sys: jitter(base.sys, 3, 60, 240),
        dia: jitter(base.dia, 2, 30, 150),
        rr: jitter(base.rr, 1, 6, 50),
        temp: jitter(base.temp, 0.08, 33, 43),
        spo2: base.spo2 === undefined ? undefined : Math.min(100, jitter(base.spo2, 0.8, 60, 100)!),
      });
    }, 2200);
    return () => window.clearInterval(id);
    // Base values come from the case and do not change during an interview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, vitals]);

  const hrAlarm = live.hr !== undefined && abnormal.hr(live.hr);
  const bpAlarm = (live.sys !== undefined && abnormal.sys(live.sys)) || (live.dia !== undefined && abnormal.dia(live.dia));

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-xs font-semibold tabular-nums">
        <Mini icon={<HeartPulse size={13} />} alarm={hrAlarm} value={live.hr} />
        <Mini icon={<Droplets size={13} />} alarm={live.spo2 !== undefined && abnormal.spo2(live.spo2)} value={live.spo2} suffix="%" />
      </div>
    );
  }

  return (
    <section aria-label={t.consult.vitals} className="overflow-hidden rounded-2xl bg-[#07131f] p-3 text-white shadow-inner ring-1 ring-white/5">
      <div className="mb-1 flex items-center justify-between px-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/60">
          <Activity size={13} className="text-emerald-400" aria-hidden />
          {t.consult.vitals}
        </p>
        <p className="text-[10px] text-white/40">{t.consult.vitalsSimulated}</p>
      </div>

      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <EcgStrip heartRate={live.hr ?? 75} alarm={hrAlarm} />
        </div>
        <Reading label={t.consult.hr} value={live.hr} alarm={hrAlarm} unit="bpm" big tone="text-emerald-400" />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
        <Tile label={t.consult.bp} icon={<Activity size={12} />} alarm={bpAlarm}>
          {live.sys !== undefined ? (
            <span className="tabular-nums">
              <Num value={live.sys} />/<Num value={live.dia ?? 0} />
            </span>
          ) : (
            "—"
          )}
        </Tile>
        <Tile label={t.consult.spo2} icon={<Droplets size={12} />} alarm={live.spo2 !== undefined && abnormal.spo2(live.spo2)} tone="text-sky-300">
          {live.spo2 !== undefined ? (
            <>
              <Num value={live.spo2} />
              <small className="ml-0.5 text-[10px] opacity-60">%</small>
            </>
          ) : (
            "—"
          )}
        </Tile>
        <Tile label={t.consult.temp} icon={<Thermometer size={12} />} alarm={live.temp !== undefined && abnormal.temp(live.temp)} tone="text-amber-300">
          {live.temp !== undefined ? (
            <>
              <Num value={live.temp} digits={1} />
              <small className="ml-0.5 text-[10px] opacity-60">°C</small>
            </>
          ) : (
            "—"
          )}
        </Tile>
        <Tile label={t.consult.rr} icon={<Wind size={12} />} alarm={live.rr !== undefined && abnormal.rr(live.rr)} tone="text-violet-300">
          {live.rr !== undefined ? (
            <>
              <Num value={live.rr} />
              <small className="ml-0.5 text-[10px] opacity-60">{t.consult.perMin}</small>
            </>
          ) : (
            "—"
          )}
        </Tile>
      </div>
    </section>
  );
}

/** A number that eases to each new value without re-rendering per frame. */
export function Num({ value, digits = 0 }: { value: number; digits?: number }) {
  const spring = useSpring(value, { stiffness: 60, damping: 18 });
  const text = useTransform(spring, (v) => v.toFixed(digits));
  useEffect(() => {
    spring.set(value);
  }, [spring, value]);
  return <motion.span>{text}</motion.span>;
}

function Reading({ label, value, alarm, unit, tone, big }: { label: string; value?: number; alarm: boolean; unit: string; tone: string; big?: boolean }) {
  return (
    <div className="w-20 shrink-0 text-right">
      <p className={cn("text-[10px] font-semibold uppercase tracking-wider", alarm ? "text-alert" : "text-white/50")}>{label}</p>
      <p className={cn("font-display font-bold leading-none tabular-nums", big ? "text-4xl" : "text-xl", alarm ? "animate-alarm text-alert" : tone)}>
        {value !== undefined ? <Num value={value} /> : "—"}
      </p>
      <p className="text-[10px] text-white/40">{unit}</p>
    </div>
  );
}

function Tile({ label, icon, alarm, tone = "text-white", children }: { label: string; icon: ReactNode; alarm: boolean; tone?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl px-2.5 py-2 ring-1 transition-colors", alarm ? "bg-alert/15 ring-alert/50" : "bg-white/[0.04] ring-white/5")}>
      <p className={cn("flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider", alarm ? "text-alert" : "text-white/50")}>
        {icon}
        {label}
        {alarm && <span className="ml-auto h-1.5 w-1.5 animate-alarm rounded-full bg-alert" aria-hidden />}
      </p>
      <p className={cn("mt-0.5 font-display text-lg font-bold leading-tight", alarm ? "animate-alarm text-alert" : tone)}>{children}</p>
    </div>
  );
}

function Mini({ icon, value, alarm, suffix = "" }: { icon: ReactNode; value?: number; alarm: boolean; suffix?: string }) {
  if (value === undefined) return null;
  return (
    <span className={cn("flex items-center gap-1", alarm ? "animate-alarm text-alert" : "text-muted")}>
      {icon}
      <Num value={value} />
      {suffix}
    </span>
  );
}
