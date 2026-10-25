import "server-only";
import { loadDemoCase } from "@/lib/cases/demo";
import { listScenarios, type Role } from "@/lib/scenarios";

/** What a scenario card shows: the overlay plus the case's public facts. */
export interface ScenarioCard {
  id: string;
  title: string;
  roles: Role[];
  setting: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  timeCritical: boolean;
  patientName: string;
  patientAge: number;
}

export function scenarioCards(): ScenarioCard[] {
  return listScenarios().map((s) => {
    const c = loadDemoCase(s.caseId).public;
    return {
      id: s.id,
      title: s.title,
      roles: s.roles,
      setting: s.setting ?? c.setting.mn,
      difficulty: c.difficulty,
      timeCritical: c.timeCritical,
      patientName: c.patient.name,
      patientAge: c.patient.age,
    };
  });
}
