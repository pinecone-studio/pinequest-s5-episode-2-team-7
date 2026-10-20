import type { PatientCase } from "./schema";

/**
 * The ONLY case shape that may be sent to a student's browser before the
 * interview is evaluated. It is built field-by-field (allow-list), never by
 * spreading and deleting, so new private fields can't leak by accident.
 */
export interface PublicCase {
  id: string;
  version: number;
  displayTitle: { mn: string; en?: string };
  specialty: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  setting: { mn: string; en?: string };
  patient: {
    name: string;
    age: number;
    sex: "male" | "female";
    occupation?: { mn: string; en?: string };
  };
  chiefComplaint: { mn: string; en?: string };
  initialVitals?: {
    bloodPressure?: string;
    heartRate?: number;
    respiratoryRate?: number;
    temperatureC?: number;
    spo2?: number;
  };
  estimatedMinutes: number;
  timeCritical: boolean;
  synthetic: boolean;
}

export function toPublicCase(c: PatientCase): PublicCase {
  const p = c.public;
  return {
    id: c.id,
    version: c.version,
    displayTitle: { mn: p.displayTitle.mn, en: p.displayTitle.en },
    specialty: p.specialty,
    difficulty: p.difficulty,
    tags: [...p.tags],
    setting: { mn: p.setting.mn, en: p.setting.en },
    patient: {
      name: p.patient.name,
      age: p.patient.age,
      sex: p.patient.sex,
      occupation: p.patient.occupation ? { mn: p.patient.occupation.mn, en: p.patient.occupation.en } : undefined,
    },
    chiefComplaint: { mn: p.chiefComplaint.mn, en: p.chiefComplaint.en },
    initialVitals: p.initialVitals ? { ...p.initialVitals } : undefined,
    estimatedMinutes: p.estimatedMinutes,
    timeCritical: p.timeCritical,
    synthetic: c.provenance.synthetic,
  };
}

/** Keys that must never appear in anything serialised for a student. */
export const PRIVATE_CASE_KEYS = ["hidden", "rubric", "persona", "education", "provenance", "internalTitle", "facts", "diagnosis", "acceptedAliases"] as const;
