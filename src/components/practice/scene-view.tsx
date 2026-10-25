"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Compass, MessageCircleHeart, WifiOff, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { t } from "@/i18n";
import type { MotionAccess } from "@/lib/motion-permission";
import type { HotspotId, Scenario } from "@/lib/scenarios";
import { VitalsMonitor } from "../interview/vitals-monitor";
import { Spinner, cn } from "../ui";
import type { PracticeMode } from "./practice-scenario";

const Panorama = dynamic(() => import("./panorama"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-white/70">
      <Spinner />
    </div>
  ),
});

interface Props {
  scenario: Scenario;
  /** Panorama URL: a preloaded blob: URL when available, else the file path. */
  panorama: string;
  mode: PracticeMode;
  motion: MotionAccess;
  debug?: boolean;
  onBack: () => void;
}

/** The 360° scene: look around, then tap Өвчтөн (interview), Монитор (vitals) or Гэр бүлийн гишүүн (collateral history). */
export function SceneView({ scenario, panorama, mode, motion: access, debug = false, onBack }: Props) {
  const router = useRouter();
  // Fixed for this visit: a blob that arrives later must not rebuild the viewer.
  const [src] = useState(panorama);
  const [sheet, setSheet] = useState<"monitor" | "family" | null>(null);
  const [gyro, setGyro] = useState(access === "granted");
  const [gyroAvailable, setGyroAvailable] = useState(access !== "unsupported");
  const [tap, setTap] = useState<string | null>(null);
  const h = scenario.hotspots;

  function onHotspot(id: HotspotId) {
    if (id === "patient") {
      router.push(mode.kind === "online" ? `/interview/${mode.sessionId}` : `/demo/${mode.offlineCaseId}`);
    } else {
      setSheet(id);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
      <Panorama
        src={src}
        startYaw={h.patient.yaw}
        hotspots={[
          { id: "patient", label: t.practice.hotspots.patient, ...h.patient },
          { id: "monitor", label: t.practice.hotspots.monitor, ...h.monitor },
          { id: "family", label: t.practice.hotspots.family, ...h.family },
        ]}
        gyro={gyro}
        onGyroChange={setGyro}
        onGyroUnavailable={() => {
          setGyro(false);
          setGyroAvailable(false);
        }}
        onHotspot={onHotspot}
        onDebugTap={debug ? (yaw, pitch) => setTap(`"yaw": ${yaw}, "pitch": ${pitch}`) : undefined}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onBack} className="pointer-events-auto flex h-11 items-center gap-1.5 rounded-full bg-black/55 px-4 text-sm font-semibold backdrop-blur">
          <ArrowLeft size={18} aria-hidden /> {t.practice.back}
        </button>
        <div className="flex flex-col items-end gap-2">
          {gyroAvailable && (
            <button
              type="button"
              aria-pressed={gyro}
              aria-label={t.practice.motionToggle}
              onClick={() => setGyro((g) => !g)}
              className={cn("pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full backdrop-blur", gyro ? "bg-emerald-500/80" : "bg-black/55")}
            >
              <Compass size={20} aria-hidden />
            </button>
          )}
          {mode.kind === "offline" && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/85 px-3 py-1 text-xs font-semibold text-black">
              <WifiOff size={14} aria-hidden /> {t.consult.offlineBadge}
            </span>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-white/85 [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]">
        {tap ? <code className="pointer-events-auto rounded bg-black/70 px-2 py-1 font-mono text-xs select-all">{tap}</code> : <p>{gyro || !gyroAvailable ? t.practice.hint : t.practice.motionOff}</p>}
      </div>

      <AnimatePresence>
        {sheet === "monitor" && (
          <Sheet key="monitor" title={t.practice.hotspots.monitor} onClose={() => setSheet(null)}>
            <VitalsMonitor vitals={scenario.vitals} />
            {scenario.vitals.gcs !== undefined && (
              <p className="mt-2 rounded-xl bg-white/[0.06] px-3 py-2 text-sm">
                <span className="font-semibold text-white/60">{t.practice.vitals.gcs}</span>{" "}
                <span className={cn("font-display text-lg font-bold", scenario.vitals.gcs < 15 && "text-alert")}>{scenario.vitals.gcs}/15</span>
              </p>
            )}
          </Sheet>
        )}
        {sheet === "family" && (
          <Sheet key="family" title={t.practice.familyTitle(scenario.family.who)} onClose={() => setSheet(null)}>
            <ul className="space-y-2">
              {scenario.family.lines.map((line) => (
                <li key={line} className="flex gap-2 rounded-2xl rounded-tl-md bg-white/[0.08] px-4 py-2.5 text-[15px] leading-relaxed">
                  <MessageCircleHeart size={18} className="mt-0.5 shrink-0 text-rose-300" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <motion.button
        type="button"
        aria-label={t.common.close}
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40"
      />
      <motion.section
        role="dialog"
        aria-label={title}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[80dvh] max-w-xl overflow-y-auto rounded-t-[1.75rem] bg-[#0b1724] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] ring-1 ring-white/10"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
      </motion.section>
    </>
  );
}
