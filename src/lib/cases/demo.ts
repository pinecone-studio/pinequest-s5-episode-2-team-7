import chestPain from "../../../data/cases/chest-pain-01.json";
import abdominalPain from "../../../data/cases/abdominal-pain-01.json";
import pneumonia from "../../../data/cases/cough-malaise-01.json";
import { PatientCase } from "./schema";

/**
 * Bundled synthetic demonstration cases (data/cases/*.json). They are seeded
 * into the database by `npm run db:seed` and used directly by tests.
 */
export const DEMO_CASE_SOURCES: unknown[] = [chestPain, abdominalPain, pneumonia];

export function loadDemoCases(): PatientCase[] {
  return DEMO_CASE_SOURCES.map((source) => PatientCase.parse(source));
}

export function loadDemoCase(id: string): PatientCase {
  const found = loadDemoCases().find((c) => c.id === id);
  if (!found) throw new Error(`Demo case not found: ${id}`);
  return found;
}
