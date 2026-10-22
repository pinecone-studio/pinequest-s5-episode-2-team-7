import chestPain from "../../../data/cases/chest-pain-01.json";
import abdominalPain from "../../../data/cases/abdominal-pain-01.json";
import pneumonia from "../../../data/cases/cough-malaise-01.json";
import ectopic from "../../../data/cases/abdominal-pain-02.json";
import tuberculosis from "../../../data/cases/cough-weight-loss-01.json";
import heartFailure from "../../../data/cases/dyspnea-swelling-01.json";
import pyelonephritis from "../../../data/cases/fever-back-pain-01.json";
import brucellosis from "../../../data/cases/fever-joint-pain-01.json";
import renalColic from "../../../data/cases/flank-pain-01.json";
import subarachnoid from "../../../data/cases/headache-01.json";
import carbonMonoxide from "../../../data/cases/headache-dizziness-01.json";
import graves from "../../../data/cases/palpitations-01.json";
import ketoacidosis from "../../../data/cases/vomiting-thirst-01.json";
import { PatientCase } from "./schema";

/**
 * Bundled synthetic demonstration cases (data/cases/*.json). They are seeded
 * into the database by `npm run db:seed` and used directly by tests.
 */
export const DEMO_CASE_SOURCES: unknown[] = [
  chestPain,
  abdominalPain,
  pneumonia,
  ectopic,
  tuberculosis,
  heartFailure,
  pyelonephritis,
  brucellosis,
  renalColic,
  subarachnoid,
  carbonMonoxide,
  graves,
  ketoacidosis,
];

export function loadDemoCases(): PatientCase[] {
  return DEMO_CASE_SOURCES.map((source) => PatientCase.parse(source));
}

export function loadDemoCase(id: string): PatientCase {
  const found = loadDemoCases().find((c) => c.id === id);
  if (!found) throw new Error(`Demo case not found: ${id}`);
  return found;
}
