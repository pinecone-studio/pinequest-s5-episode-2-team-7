import { z } from "zod";
import { TOPIC_IDS, getTopic } from "@/lib/patient/topics";

/**
 * Canonical structured patient case.
 *
 * The full object is PRIVATE and must never be sent to a student's browser
 * before evaluation. Use `toPublicCase()` (./public.ts) for anything rendered
 * to students. The same format is exported as JSON Schema for the Python
 * training pipeline (`npm run schema:export`).
 */

const slug = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, "Зөвхөн жижиг латин үсэг, тоо, '-' эсвэл '_' ашиглана");

export const LocalizedText = z.object({
  mn: z.string().trim().min(1, "Монгол текст шаардлагатай"),
  en: z.string().trim().min(1).optional(),
});
export type LocalizedText = z.infer<typeof LocalizedText>;

export const TopicIdSchema = z.enum(TOPIC_IDS);

export const FactKind = z.enum([
  "positive", // symptom / finding that is present
  "negative", // explicitly absent (pertinent negative) with custom wording
  "history", // past medical / medication / family / social history
  "exam", // physical examination finding — narrator only
  "vital", // vital sign — narrator only
  "investigation", // lab / imaging result — narrator only, if enabled
]);

/** Meta topics a patient fact may answer (open questions, ICE). */
const PATIENT_META_TOPICS = new Set(["associated_general", "concerns"]);

export const CaseFact = z
  .object({
    id: slug,
    kind: FactKind,
    /** Topics whose questions may disclose this fact. */
    topics: z.array(TopicIdSchema).min(1),
    /** Whether the patient could know this (false for exam/vitals/labs). */
    patientKnows: z.boolean(),
    /**
     * Patient's own first-person words (for patient-known facts) or the
     * narrator's description (for exam findings). Mongolian is required.
     */
    answer: LocalizedText,
    /** Why the finding matters clinically — shown only in feedback. */
    significance: LocalizedText.optional(),
    /**
     * Distinctive words that should not appear in an LLM-written answer
     * unless this fact is being disclosed (leak detection).
     */
    leakTerms: z.array(z.string().min(2)).default([]),
    /** Whether the patient may mention this when asked a broad question. */
    volunteerOnBroad: z.boolean().default(false),
  })
  .superRefine((fact, ctx) => {
    const narratorOnly = fact.kind === "exam" || fact.kind === "vital" || fact.kind === "investigation";
    if (narratorOnly && fact.patientKnows) {
      ctx.addIssue({
        code: "custom",
        path: ["patientKnows"],
        message: `"${fact.kind}" төрлийн баримтыг өвчтөн өөрөө мэдэх боломжгүй (patientKnows=false байх ёстой)`,
      });
    }
    if (!narratorOnly && !fact.patientKnows) {
      ctx.addIssue({
        code: "custom",
        path: ["patientKnows"],
        message: "Өвчтөний ярих баримт patientKnows=true байх ёстой",
      });
    }
    for (const topicId of fact.topics) {
      const kind = getTopic(topicId)?.kind;
      if (narratorOnly && kind !== "exam") {
        ctx.addIssue({ code: "custom", path: ["topics"], message: `Үзлэгийн баримт зөвхөн exam сэдэвтэй холбогдоно (${topicId})` });
      }
      if (!narratorOnly && (kind === "exam" || (kind === "meta" && !PATIENT_META_TOPICS.has(topicId)))) {
        ctx.addIssue({ code: "custom", path: ["topics"], message: `Өвчтөний баримт "${topicId}" сэдэвтэй холбогдох боломжгүй` });
      }
    }
  });
export type CaseFact = z.infer<typeof CaseFact>;

export const DiagnosisSpec = z.object({
  label: LocalizedText,
  icd10: z.string().optional(),
  /** Terms that count as a fully correct diagnosis (any language). */
  acceptedAliases: z.array(z.string().min(2)).min(1),
  /** Less specific but clinically reasonable answers — partial credit. */
  partialAliases: z.array(z.string().min(2)).default([]),
});

export const Differential = z.object({
  label: LocalizedText,
  aliases: z.array(z.string().min(2)).default([]),
  rationale: LocalizedText,
});

export const RubricCategory = z.enum([
  "hpi",
  "associated_symptoms",
  "pertinent_negatives",
  "past_history",
  "medications_allergies",
  "family_history",
  "social_history",
  "risk_factors",
  "red_flags",
]);
export type RubricCategory = z.infer<typeof RubricCategory>;

export const RubricItem = z.object({
  id: slug,
  label: LocalizedText,
  category: RubricCategory,
  /** Asking about ANY of these topics satisfies the item. */
  topics: z.array(TopicIdSchema).min(1),
  weight: z.number().positive().max(10).default(1),
  critical: z.boolean().default(false),
  rationale: LocalizedText,
  suggestedQuestion: LocalizedText,
});
export type RubricItem = z.infer<typeof RubricItem>;

export const ScoreWeights = z
  .object({
    diagnosis: z.number().min(0).max(1),
    history: z.number().min(0).max(1),
    critical: z.number().min(0).max(1),
  })
  .refine((w) => Math.abs(w.diagnosis + w.history + w.critical - 1) < 1e-6, {
    message: "Онооны жингийн нийлбэр 1 байх ёстой",
  });
export type ScoreWeights = z.infer<typeof ScoreWeights>;

export const Sex = z.enum(["male", "female"]);

export const Vitals = z.object({
  bloodPressure: z.string().optional(),
  heartRate: z.number().optional(),
  respiratoryRate: z.number().optional(),
  temperatureC: z.number().optional(),
  spo2: z.number().optional(),
});

export const Provenance = z.object({
  source: z.enum(["synthetic", "agentclinic", "meditod", "patientsim", "other"]),
  sourceId: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  synthetic: z.boolean(),
  authors: z.array(z.string()).min(1),
  createdAt: z.string(),
  license: z.string().min(1),
  attribution: z.string().optional(),
  redistributable: z.boolean(),
  trainingUseAllowed: z.boolean(),
  clinicalReview: z.object({
    status: z.enum(["unreviewed", "in_review", "reviewed"]),
    reviewer: z.string().optional(),
    reviewedAt: z.string().optional(),
    notes: z.string().optional(),
  }),
  translation: z.object({
    sourceLanguage: z.enum(["mn", "en"]),
    status: z.enum(["original", "machine", "ai_drafted", "human_reviewed"]),
    translator: z.string().optional(),
    reviewer: z.string().optional(),
  }),
});

export const PatientCase = z
  .object({
    schemaVersion: z.literal(1),
    id: slug,
    version: z.number().int().positive().default(1),
    /** Internal title — may reveal the diagnosis. Admin only. */
    internalTitle: z.string().min(3),
    public: z.object({
      /** Student-facing title; must NOT reveal the diagnosis. */
      displayTitle: LocalizedText,
      specialty: z.string().min(2),
      difficulty: z.enum(["beginner", "intermediate", "advanced"]),
      tags: z.array(z.string()).default([]),
      setting: LocalizedText,
      patient: z.object({
        name: z.string().min(1),
        age: z.number().int().min(0).max(120),
        sex: Sex,
        occupation: LocalizedText.optional(),
      }),
      chiefComplaint: LocalizedText,
      /** Topics that ARE the chief complaint (never answered negatively). */
      chiefComplaintTopics: z.array(TopicIdSchema).min(1),
      /** First words of the patient — chief complaint only. */
      openingLine: LocalizedText,
      /** Vitals shown in the patient panel from the start (optional). */
      initialVitals: Vitals.optional(),
      estimatedMinutes: z.number().int().positive().default(15),
      timeCritical: z.boolean().default(false),
    }),
    persona: z.object({
      personality: LocalizedText,
      speakingStyle: LocalizedText,
      emotionalState: LocalizedText,
    }),
    hidden: z.object({
      diagnosis: DiagnosisSpec,
      differentials: z.array(Differential).default([]),
      summary: LocalizedText,
      facts: z.array(CaseFact).min(3),
      /** Whether investigation facts are disclosed when requested. */
      investigationsAvailable: z.boolean().default(false),
    }),
    rubric: z.object({
      weights: ScoreWeights.optional(),
      items: z.array(RubricItem).min(1),
    }),
    education: z.object({
      explanation: LocalizedText,
      learningPoints: z.array(LocalizedText).min(1),
      emergency: z
        .object({
          escalation: LocalizedText,
        })
        .optional(),
    }),
    provenance: Provenance,
  })
  .superRefine((c, ctx) => {
    const factIds = new Set<string>();
    c.hidden.facts.forEach((fact, i) => {
      if (factIds.has(fact.id)) {
        ctx.addIssue({ code: "custom", path: ["hidden", "facts", i, "id"], message: `Давхардсан баримтын id: ${fact.id}` });
      }
      factIds.add(fact.id);
    });

    const rubricIds = new Set<string>();
    c.rubric.items.forEach((item, i) => {
      if (rubricIds.has(item.id)) {
        ctx.addIssue({ code: "custom", path: ["rubric", "items", i, "id"], message: `Давхардсан рубрикийн id: ${item.id}` });
      }
      rubricIds.add(item.id);
    });

    if (!c.rubric.items.some((item) => item.critical)) {
      ctx.addIssue({ code: "custom", path: ["rubric", "items"], message: "Дор хаяж нэг чухал (critical) асуулт шаардлагатай" });
    }
    if (!c.rubric.items.some((item) => !item.critical)) {
      ctx.addIssue({ code: "custom", path: ["rubric", "items"], message: "Дор хаяж нэг энгийн (critical биш) асуулт шаардлагатай" });
    }

    // The public title and opening line must not leak the diagnosis.
    const aliases = [...c.hidden.diagnosis.acceptedAliases, c.hidden.diagnosis.label.mn, c.hidden.diagnosis.label.en ?? ""]
      .map((a) => a.toLowerCase().trim())
      .filter((a) => a.length >= 3);
    const publicText = [c.id.replace(/[-_]/g, " "), c.public.displayTitle.mn, c.public.displayTitle.en ?? "", c.public.openingLine.mn, c.public.chiefComplaint.mn, ...c.public.tags]
      .join(" ")
      .toLowerCase();
    for (const alias of aliases) {
      if (publicText.includes(alias)) {
        ctx.addIssue({ code: "custom", path: ["public"], message: `Нийтэд харагдах текстэд онош ("${alias}") илэрч байна` });
      }
    }

    // Every rubric topic should be answerable: either a fact covers it, or it
    // is a symptom/meta topic that has a defined default answer.
    const coveredTopics = new Set(c.hidden.facts.flatMap((f) => f.topics));
    c.rubric.items.forEach((item, i) => {
      const answerable = item.topics.some((topicId) => {
        const topic = getTopic(topicId);
        return coveredTopics.has(topicId) || topic?.kind === "symptom" || topic?.kind === "meta";
      });
      if (!answerable) {
        ctx.addIssue({
          code: "custom",
          path: ["rubric", "items", i, "topics"],
          message: `Рубрикийн "${item.id}" асуултад хариулах баримт кейст алга`,
        });
      }
    });
  });

export type PatientCase = z.infer<typeof PatientCase>;
export type PatientCaseInput = z.input<typeof PatientCase>;

export interface CaseValidationIssue {
  path: string;
  message: string;
}

export type CaseValidationResult =
  | { ok: true; case: PatientCase }
  | { ok: false; issues: CaseValidationIssue[] };

/** Validate unknown JSON and return human-readable issues. */
export function validateCase(input: unknown): CaseValidationResult {
  const parsed = PatientCase.safeParse(input);
  if (parsed.success) return { ok: true, case: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join(".") || "(root)",
      message: issue.message,
    })),
  };
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = { diagnosis: 0.4, history: 0.4, critical: 0.2 };
