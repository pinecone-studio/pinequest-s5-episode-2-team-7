"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, ClipboardList, Heart, HeartCrack, RotateCcw, Stethoscope, Timer, UserRound, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ScoreRing } from "@/components/score-ring";
import { buttonClass, cn } from "@/components/ui";
import { saveScenarioResult } from "@/lib/practice/history";
import { findArticle } from "@/lib/practice/knowledge";
import { applyEffect, danger, scoreOf, type OptionGrade, type Scenario, type ScenarioOption, type Vitals } from "@/lib/practice/scenarios";
import { SceneWindow } from "./scene-window";

type Stage = { name: "briefing" } | { name: "step"; i: number } | { name: "feedback"; i: number } | { name: "debrief" };

/** Asks for motion access on iOS Safari (must run inside a tap); elsewhere it is already on. */
async function askMotion() {
  const DOE = (globalThis as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  await DOE?.requestPermission?.().catch(() => null);
}

/** One emergency case played as decisions (as `ScenarioPlayView` in the iOS app). */
export function ScenarioPlay({ scenario, roleTitle }: { scenario: Scenario; roleTitle: string }) {
  const [stage, setStage] = useState<Stage>({ name: "briefing" });
  const [vitals, setVitals] = useState<Vitals>(scenario.start);
  const [choices, setChoices] = useState<Record<string, ScenarioOption>>({});
  const [stepSeconds, setStepSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [overtime, setOvertime] = useState(0);
  const [showFindings, setShowFindings] = useState(false);
  const saved = useRef(false);

  const index = stage.name === "step" || stage.name === "feedback" ? stage.i : null;

  // One-second clock while a step is on screen.
  useEffect(() => {
    if (stage.name !== "step") return;
    const timer = window.setInterval(() => {
      setStepSeconds((s) => s + 1);
      setTotalSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage.name]);

  function choose(option: ScenarioOption, i: number) {
    const step = scenario.steps[i];
    setChoices((c) => ({ ...c, [step.id]: option }));
    if (stepSeconds > step.timeLimit) setOvertime((o) => o + 1);
    setVitals((v) => applyEffect(v, option.effect));
    navigator.vibrate?.(option.grade === "best" ? 30 : [40, 60, 40]);
    setStage({ name: "feedback", i });
  }

  const score = scoreOf(scenario, choices, overtime);
  const stable = danger(vitals) < 0.4 && !Object.values(choices).some((c) => c.grade === "harmful");

  function next(i: number) {
    setShowFindings(false);
    if (i + 1 < scenario.steps.length) {
      setStage({ name: "step", i: i + 1 });
      setStepSeconds(0);
      return;
    }
    setStage({ name: "debrief" });
    if (!saved.current) {
      saved.current = true;
      saveScenarioResult({ scenarioId: scenario.id, title: scenario.title, score, seconds: totalSeconds, stable });
    }
  }

  function restart() {
    setVitals(scenario.start);
    setChoices({});
    setStepSeconds(0);
    setTotalSeconds(0);
    setOvertime(0);
    saved.current = false;
    setStage({ name: "briefing" });
  }

  if (stage.name === "debrief") {
    return (
      <main className="mx-auto w-full max-w-2xl space-y-4 px-5 pb-10 pt-6">
        <CloseButton />
        <div className="glass flex items-center gap-5 rounded-[26px] p-4">
          <ScoreRing score={score} size={92} label="Оноо" />
          <div className="space-y-1">
            <h1 className="font-semibold">{scenario.title}</h1>
            <p className={cn("flex items-center gap-1.5 text-sm font-semibold", stable ? "text-ok" : "text-alert")}>
              {stable ? <Heart size={16} aria-hidden /> : <HeartCrack size={16} aria-hidden />}
              {stable ? "Өвчтөн тогтворжлоо" : "Өвчтөний байдал дордлоо"}
            </p>
            <p className="text-xs text-muted">
              Хугацаа: {Math.floor(totalSeconds / 60)}:{String(totalSeconds % 60).padStart(2, "0")}
            </p>
          </div>
        </div>

        <h2 className="text-lg font-semibold">Алхам бүрээр</h2>
        {scenario.steps.map((step) => {
          const picked = choices[step.id];
          if (!picked) return null;
          return (
            <div key={step.id} className="glass space-y-1.5 rounded-[20px] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-accent-deep">{step.phase}</span>
                <GradeBadge grade={picked.grade} />
              </div>
              <p className="text-sm">{picked.text}</p>
              <p className="text-xs text-muted">{picked.feedback}</p>
            </div>
          );
        })}

        <h2 className="text-lg font-semibold">Цааш судлах</h2>
        <div className="flex flex-wrap gap-2">
          {scenario.learnMore.map(findArticle).map(
            (a) =>
              a && (
                <Link key={a.id} href={`/knowledge/${a.id}`} className="rounded-full bg-field px-3.5 py-2 text-sm font-medium ring-1 ring-line hover:bg-white/10">
                  {a.title}
                </Link>
              ),
          )}
        </div>

        <div className="space-y-2.5 pt-2">
          <Link href={`/soril?topic=${encodeURIComponent(scenario.quizTopic)}`} className={buttonClass("primary", "lg", "w-full")}>
            <ClipboardList size={18} aria-hidden /> Энэ сэдвээр Сорил өгөх
          </Link>
          <button type="button" onClick={restart} className={buttonClass("secondary", "lg", "w-full")}>
            <RotateCcw size={18} aria-hidden /> Дахин тоглох
          </button>
        </div>
        <p className="text-[11px] text-muted">⚠️ Сургалтын симуляци. Эмнэлзүйн агуулгыг багш, эмчээр баталгаажуулна.</p>
      </main>
    );
  }

  const step = index !== null ? scenario.steps[index] : null;
  return (
    <main className="fixed inset-0 z-50 flex flex-col bg-black text-ink">
      <div className="relative min-h-0 flex-1">
        <SceneWindow kind={scenario.scene} danger={danger(vitals)} onPatient={step ? () => setShowFindings(true) : undefined} className="absolute inset-0" />
        <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-4" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
          <CloseButton />
          <span className="flex-1" />
          {step && index !== null && (
            <>
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-2 text-sm font-semibold tabular-nums backdrop-blur",
                  stepSeconds > step.timeLimit ? "text-red-400" : "text-white",
                )}
              >
                <Timer size={15} aria-hidden /> {stepSeconds} / {step.timeLimit}с
              </span>
              <span className="rounded-full bg-black/45 px-3 py-2 text-sm font-semibold text-white backdrop-blur">
                {index + 1}/{scenario.steps.length}
              </span>
            </>
          )}
        </div>
        {showFindings && step && (
          <div className="absolute inset-x-4 top-20 rounded-[20px] bg-[#17141f]/95 p-4 shadow-xl ring-1 ring-line backdrop-blur" role="dialog" aria-label="Үзлэгийн илрэл">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold">
                <Stethoscope size={18} aria-hidden /> Үзлэгийн илрэл
              </h2>
              <button type="button" onClick={() => setShowFindings(false)} aria-label="Хаах" className="text-muted hover:text-ink">
                <XCircle size={20} />
              </button>
            </div>
            <ul className="space-y-1.5 text-sm">
              {step.findings.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> {f}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <VitalsStrip vitals={vitals} />

      <section className="max-h-[55dvh] overflow-y-auto rounded-t-[28px] bg-canvas px-5 pb-8 pt-5" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
        {stage.name === "briefing" && (
          <div className="space-y-3">
            <h1 className="text-2xl font-bold">{scenario.title}</h1>
            <p className="prose-mn">{scenario.briefing}</p>
            <p className="flex gap-2 text-sm text-muted">
              <UserRound size={16} className="mt-0.5 shrink-0" aria-hidden /> {scenario.patient}
            </p>
            <p className="text-xs text-muted">Та: {roleTitle}. Хуруугаараа чирж (утсан дээр хөдөлгөж) эргэн тойрноо хар. Өвчтөн дээр дарж үзлэг хий.</p>
            <button
              type="button"
              className={buttonClass("primary", "lg", "w-full")}
              onClick={() => {
                void askMotion();
                setStage({ name: "step", i: 0 });
                setStepSeconds(0);
              }}
            >
              Эхлэх
            </button>
          </div>
        )}

        {stage.name === "step" && step && (
          <div className="space-y-3">
            <span className="inline-block rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-deep">{step.phase}</span>
            <p className="prose-mn text-sm">{step.situation}</p>
            <h2 className="font-semibold">{step.question}</h2>
            {step.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => choose(option, stage.i)}
                className="w-full rounded-2xl bg-field p-3.5 text-left text-sm ring-1 ring-subtle/35 transition hover:ring-accent"
              >
                {option.text}
              </button>
            ))}
          </div>
        )}

        {stage.name === "feedback" && step && (
          <Feedback step={step} picked={choices[step.id]} last={stage.i + 1 === scenario.steps.length} onNext={() => next(stage.i)} />
        )}
      </section>
    </main>
  );
}

function Feedback({ step, picked, last, onNext }: { step: Scenario["steps"][number]; picked: ScenarioOption | undefined; last: boolean; onNext: () => void }) {
  const best = step.options.find((o) => o.grade === "best");
  return (
    <div className="space-y-3">
      {picked && (
        <>
          <GradeBadge grade={picked.grade} />
          <p className="text-sm font-semibold">{picked.text}</p>
          <p className="prose-mn text-sm">{picked.feedback}</p>
          {picked.grade !== "best" && best && (
            <div className="rounded-[14px] bg-ok/10 p-3">
              <p className="text-xs font-bold text-ok">Зөв хариулт</p>
              <p className="text-sm">{best.text}</p>
            </div>
          )}
        </>
      )}
      <button type="button" onClick={onNext} className={buttonClass("primary", "lg", "w-full")}>
        {last ? "Дүгнэлт харах" : "Дараагийн алхам"}
      </button>
    </div>
  );
}

function CloseButton() {
  return (
    <Link href="/cases" aria-label="Гарах" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/55 backdrop-blur">
      <X size={18} />
    </Link>
  );
}

const GRADES: Record<OptionGrade, { text: string; icon: typeof CheckCircle2; className: string }> = {
  best: { text: "Зөв", icon: CheckCircle2, className: "text-ok bg-ok/12" },
  ok: { text: "Хангалтгүй", icon: AlertCircle, className: "text-warn bg-warn/12" },
  wrong: { text: "Буруу", icon: XCircle, className: "text-alert bg-alert/12" },
  harmful: { text: "Аюултай", icon: AlertTriangle, className: "text-alert bg-alert/12" },
};

export function GradeBadge({ grade }: { grade: OptionGrade }) {
  const g = GRADES[grade];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold", g.className)}>
      <g.icon size={14} aria-hidden /> {g.text}
    </span>
  );
}

/** HR / BP / SpO₂ / RR / GCS strip under the scene, red when out of range. */
export function VitalsStrip({ vitals }: { vitals: Vitals }) {
  const cells: [string, string, boolean][] = [
    ["ЗЦ", `${vitals.hr}`, vitals.hr > 120 || vitals.hr < 50],
    ["АД", `${vitals.sys}/${vitals.dia}`, vitals.sys < 90],
    ["SpO₂", `${vitals.spo2}%`, vitals.spo2 < 90],
    ["АТ", `${vitals.rr}`, vitals.rr > 28 || vitals.rr < 8],
    ["ГКО", `${vitals.gcs}`, vitals.gcs < 13],
  ];
  return (
    <div className="flex bg-[#0e1a24] py-2" aria-label="Амин үзүүлэлт">
      {cells.map(([label, value, bad]) => (
        <div key={label} className="flex flex-1 flex-col items-center">
          <span className="text-[10px] font-semibold text-white/60">{label}</span>
          <span className={cn("text-[17px] font-bold tabular-nums", bad ? "text-red-500" : "text-green-500")}>{value}</span>
        </div>
      ))}
    </div>
  );
}
