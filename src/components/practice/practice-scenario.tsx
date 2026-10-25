"use client";

import { ArrowLeft, Play, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { t } from "@/i18n";
import { api, withRetry } from "@/lib/api";
import { requestMotionAccess, type MotionAccess } from "@/lib/motion-permission";
import type { Scenario } from "@/lib/scenarios";
import { Alert, Button, Spinner, buttonClass } from "../ui";
import { IntroCard, type IntroInfo } from "./intro-card";
import { VitalsStrip } from "./vitals-strip";

/** Where the patient conversation runs: the real API session, or the scripted offline demo. */
export type PracticeMode = { kind: "online"; sessionId: string } | { kind: "offline"; offlineCaseId: string };

type Stage = { name: "intro" } | { name: "starting" } | { name: "failed" } | { name: "scene"; mode: PracticeMode; motion: MotionAccess };

/** Guest sign-in + a new session (which also wakes the model while the user looks around). */
async function startOnline(caseId: string): Promise<string> {
  await withRetry(() => api.ensureGuest());
  return withRetry(() => api.startSession(caseId));
}

export function PracticeScenario({ scenario, info, forceOffline = false }: { scenario: Scenario; info: IntroInfo; forceOffline?: boolean }) {
  const [stage, setStage] = useState<Stage>({ name: "intro" });
  const busy = useRef(false);

  async function start() {
    if (busy.current) return;
    busy.current = true;
    // The motion prompt must come first: iOS only allows it inside the tap.
    const motionPromise = requestMotionAccess();
    setStage({ name: "starting" });
    const motion = await motionPromise;
    let mode: PracticeMode | null = null;
    if (!forceOffline && navigator.onLine !== false) {
      try {
        mode = { kind: "online", sessionId: await startOnline(scenario.caseId) };
      } catch {
        mode = null;
      }
    }
    if (!mode && scenario.offlineCaseId) mode = { kind: "offline", offlineCaseId: scenario.offlineCaseId };
    setStage(mode ? { name: "scene", mode, motion } : { name: "failed" });
    busy.current = false;
  }

  if (stage.name === "scene") {
    return <ScenePlaceholder scenario={scenario} mode={stage.mode} onBack={() => setStage({ name: "intro" })} />;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      <Link href="/#roles" className={buttonClass("ghost", "sm", "mb-4 -ml-2")}>
        <ArrowLeft size={16} aria-hidden /> {t.practice.back}
      </Link>
      <IntroCard info={info}>
        <div className="mt-5">
          <VitalsStrip vitals={scenario.vitals} />
        </div>
        {stage.name === "failed" && (
          <div className="mt-5">
            <Alert tone="rose" title={t.practice.serverDown}>
              <Button variant="secondary" size="sm" className="mt-2" onClick={start}>
                {t.practice.retry}
              </Button>
            </Alert>
          </div>
        )}
        <Button size="lg" className="mt-6 h-14 w-full rounded-2xl text-lg" onClick={start} disabled={stage.name === "starting"}>
          {stage.name === "starting" ? (
            <>
              <Spinner /> {t.practice.starting}
            </>
          ) : (
            <>
              <Play size={20} aria-hidden /> {t.practice.start}
            </>
          )}
        </Button>
      </IntroCard>
    </main>
  );
}

/** Stand-in until the 360° viewer lands (group E): proves the session and the patient link work. */
function ScenePlaceholder({ scenario, mode, onBack }: { scenario: Scenario; mode: PracticeMode; onBack: () => void }) {
  const patientHref = mode.kind === "online" ? `/interview/${mode.sessionId}` : `/demo/${mode.offlineCaseId}`;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      {mode.kind === "offline" && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted">
          <WifiOff size={16} aria-hidden /> {t.practice.offlineNote}
        </p>
      )}
      <p className="mb-4 text-muted">{scenario.panorama}</p>
      <div className="flex flex-wrap gap-3">
        <Link href={patientHref} className={buttonClass("primary", "lg")}>
          {t.practice.hotspots.patient}
        </Link>
        <Button variant="ghost" onClick={onBack}>
          {t.practice.back}
        </Button>
      </div>
    </main>
  );
}
