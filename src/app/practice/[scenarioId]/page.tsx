import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PracticeScenario } from "@/components/practice/practice-scenario";
import { loadDemoCase } from "@/lib/cases/demo";
import { getScenario } from "@/lib/scenarios";

export const metadata: Metadata = { title: "Дадлага" };

/** Intro + vitals, then «Эхлэх» opens the 360° scene. Works without login (guest) and offline for scripted cases. */
export default async function PracticePage({ params, searchParams }: PageProps<"/practice/[scenarioId]">) {
  const { scenarioId } = await params;
  const scenario = getScenario(scenarioId);
  if (!scenario) notFound();
  const c = loadDemoCase(scenario.caseId).public;
  const { offline, debug } = await searchParams;

  return (
    <PracticeScenario
      scenario={scenario}
      info={{
        title: scenario.title,
        intro: scenario.intro,
        setting: scenario.setting ?? c.setting.mn,
        difficulty: c.difficulty,
        timeCritical: c.timeCritical,
        patient: { name: c.patient.name, age: c.patient.age, sex: c.patient.sex },
      }}
      forceOffline={offline === "1"}
      debug={debug === "1"}
    />
  );
}
