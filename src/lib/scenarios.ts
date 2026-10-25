import { z } from "zod";
import { Vitals } from "@/lib/cases/schema";
import source from "../../data/scenarios.json";

/**
 * Practice scenarios (data/scenarios.json): a presentational overlay on the
 * bundled cases — role, intro, vitals, 360° scene, hotspots and the family
 * member's card. Public data only; the diagnosis stays in the case.
 */

export const ROLES = ["student", "doctor", "nurse", "ambulance"] as const;
export type Role = (typeof ROLES)[number];

const Angle = z.object({
  yaw: z.number().min(-180).max(180),
  pitch: z.number().min(-30).max(30),
});

export const Scenario = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  caseId: z.string().min(1),
  roles: z.array(z.enum(ROLES)).min(1),
  title: z.string().min(1),
  intro: z.string().min(1),
  vitals: Vitals.extend({ gcs: z.number().int().min(3).max(15).optional() }),
  panorama: z.string().startsWith("/"),
  hotspots: z.object({ patient: Angle, monitor: Angle, family: Angle }),
  family: z.object({ who: z.string().min(1), lines: z.array(z.string().min(1)).min(3).max(5) }),
  /** Id of a scripted interview in src/lib/demo/offline-cases.ts. */
  offlineCaseId: z.string().optional(),
});
export type Scenario = z.infer<typeof Scenario>;
export type ScenarioVitals = Scenario["vitals"];
export type HotspotId = keyof Scenario["hotspots"];

export const ScenarioFile = z.object({ scenarios: z.array(Scenario).min(1) });

const SCENARIOS = ScenarioFile.parse(source).scenarios;

/** Scenarios for a role; students see every scenario. */
export function listScenarios(role?: Role, scenarios: Scenario[] = SCENARIOS): Scenario[] {
  if (!role || role === "student") return scenarios;
  return scenarios.filter((s) => s.roles.includes(role));
}

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
