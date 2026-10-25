"use client";

import { t } from "@/i18n";
import type { ScenarioVitals } from "@/lib/scenarios";
import { abnormal } from "../interview/vitals-monitor";
import { cn } from "../ui";

interface Item {
  label: string;
  value?: string;
  unit?: string;
  alarm: boolean;
}

function items(v: ScenarioVitals): Item[] {
  const [sys, dia] = (v.bloodPressure?.match(/(\d{2,3})\s*\/\s*(\d{2,3})/) ?? []).slice(1).map(Number);
  const l = t.practice.vitals;
  return [
    { label: l.hr, value: v.heartRate?.toString(), unit: "/мин", alarm: v.heartRate !== undefined && abnormal.hr(v.heartRate) },
    { label: l.bp, value: v.bloodPressure, alarm: (sys !== undefined && abnormal.sys(sys)) || (dia !== undefined && abnormal.dia(dia)) },
    { label: l.spo2, value: v.spo2?.toString(), unit: "%", alarm: v.spo2 !== undefined && abnormal.spo2(v.spo2) },
    { label: l.rr, value: v.respiratoryRate?.toString(), unit: "/мин", alarm: v.respiratoryRate !== undefined && abnormal.rr(v.respiratoryRate) },
    { label: l.temp, value: v.temperatureC?.toFixed(1), unit: "°C", alarm: v.temperatureC !== undefined && abnormal.temp(v.temperatureC) },
    { label: l.gcs, value: v.gcs?.toString(), unit: "/15", alarm: v.gcs !== undefined && v.gcs < 15 },
  ];
}

/** ЗЦ · АД · SpO₂ · АТ · Т° · ГКО, abnormal values highlighted (same ranges as the bedside monitor). */
export function VitalsStrip({ vitals }: { vitals: ScenarioVitals }) {
  return (
    <section aria-label={t.practice.vitalsTitle} className="rounded-2xl bg-[#07131f] p-3 text-white ring-1 ring-white/5">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-white/60">{t.practice.vitalsTitle}</p>
      <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {items(vitals).map((i) => (
          <div key={i.label} className={cn("rounded-xl px-2.5 py-2 ring-1", i.alarm ? "bg-alert/15 ring-alert/50" : "bg-white/[0.04] ring-white/5")}>
            <dt className={cn("text-[10px] font-semibold uppercase tracking-wider", i.alarm ? "text-alert" : "text-white/50")}>{i.label}</dt>
            <dd className={cn("font-display text-lg font-bold tabular-nums leading-tight", i.alarm && "text-alert")}>
              {i.value ?? "—"}
              {i.value && i.unit && <small className="ml-0.5 text-[10px] font-semibold opacity-60">{i.unit}</small>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
