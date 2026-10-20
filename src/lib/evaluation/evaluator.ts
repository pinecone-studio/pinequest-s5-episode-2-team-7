import { DEFAULT_SCORE_WEIGHTS, type PatientCase, type RubricCategory, type ScoreWeights } from "@/lib/cases/schema";
import type { TopicId } from "@/lib/patient/topics";
import { matchDiagnosis, type DiagnosisMatch } from "./diagnosis";

/**
 * Structured, reproducible evaluation of an interview. It is independent of
 * the patient-response generator: it only uses the private case, the
 * student's questions (with the topics recorded when they were asked) and
 * the submitted diagnosis.
 */
export const EVALUATOR_VERSION = "eval-v1";

export interface StudentQuestion {
  messageId: string;
  text: string;
  topics: TopicId[];
  mode?: string;
}

export interface EvaluationInput {
  patientCase: PatientCase;
  questions: StudentQuestion[];
  disclosedFactIds: ReadonlySet<string>;
  diagnosisText: string;
  reasoning?: string;
  /** Overrides the case weights (e.g. after educational review). */
  weights?: ScoreWeights;
}

export interface RubricResult {
  id: string;
  label: string;
  category: RubricCategory;
  critical: boolean;
  weight: number;
  covered: boolean;
  evidence?: { messageId: string; text: string };
  rationale: string;
  suggestedQuestion: string;
}

export interface ComponentScore {
  /** 0..1 achieved ratio within the component. */
  ratio: number;
  weight: number;
  /** Points out of 100 contributed to the total. */
  points: number;
  covered: number;
  total: number;
}

export interface Finding {
  factId: string;
  text: string;
  significance?: string;
}

export interface EvaluationResult {
  version: typeof EVALUATOR_VERSION;
  caseId: string;
  caseVersion: number;
  weights: ScoreWeights;
  totalScore: number;
  diagnosis: DiagnosisMatch & {
    submitted: string;
    expected: string;
    expectedEn?: string;
    explanation: string;
  };
  components: { diagnosis: ComponentScore; history: ComponentScore; critical: ComponentScore };
  items: RubricResult[];
  categories: { category: RubricCategory; covered: number; total: number }[];
  discoveredFindings: Finding[];
  missedFindings: Finding[];
  questionStats: { total: number; clinical: number; repeated: number; unclear: number; diagnosisRequests: number };
  learningPoints: string[];
  differentials: { label: string; rationale: string }[];
  emergencyNote?: string;
  summary: string;
}

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

function component(items: RubricResult[], weight: number): ComponentScore {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const coveredWeight = items.filter((i) => i.covered).reduce((sum, item) => sum + item.weight, 0);
  const ratio = totalWeight > 0 ? coveredWeight / totalWeight : 1;
  return {
    ratio: round(ratio, 3),
    weight,
    points: round(ratio * weight * 100),
    covered: items.filter((i) => i.covered).length,
    total: items.length,
  };
}

const VERDICT_TEXT: Record<DiagnosisMatch["verdict"], string> = {
  correct: "зөв",
  partial: "хэсэгчлэн зөв",
  differential: "ялган оношийн нэг боловч гол онош биш",
  incorrect: "буруу",
  empty: "оруулаагүй",
};

export function evaluateInterview(input: EvaluationInput): EvaluationResult {
  const c = input.patientCase;
  const weights = input.weights ?? c.rubric.weights ?? DEFAULT_SCORE_WEIGHTS;

  // Rubric coverage: an item is covered by the first question that asked
  // about any of its topics.
  const items: RubricResult[] = c.rubric.items.map((item) => {
    const evidence = input.questions.find((q) => q.mode !== "injection" && q.topics.some((t) => item.topics.includes(t)));
    return {
      id: item.id,
      label: item.label.mn,
      category: item.category,
      critical: item.critical,
      weight: item.weight,
      covered: Boolean(evidence),
      evidence: evidence ? { messageId: evidence.messageId, text: evidence.text } : undefined,
      rationale: item.rationale.mn,
      suggestedQuestion: item.suggestedQuestion.mn,
    };
  });

  const diagnosis = matchDiagnosis(c, input.diagnosisText);
  const critical = component(items.filter((i) => i.critical), weights.critical);
  const history = component(items.filter((i) => !i.critical), weights.history);
  const diagnosisComponent: ComponentScore = {
    ratio: diagnosis.score,
    weight: weights.diagnosis,
    points: round(diagnosis.score * weights.diagnosis * 100),
    covered: diagnosis.score === 1 ? 1 : 0,
    total: 1,
  };
  const totalScore = round(diagnosisComponent.points + history.points + critical.points);

  const categoryOrder: RubricCategory[] = [];
  for (const item of items) if (!categoryOrder.includes(item.category)) categoryOrder.push(item.category);
  const categories = categoryOrder.map((category) => {
    const inCategory = items.filter((i) => i.category === category);
    return { category, covered: inCategory.filter((i) => i.covered).length, total: inCategory.length };
  });

  const significant = c.hidden.facts.filter((f) => f.patientKnows && f.significance);
  const discoveredFindings = significant
    .filter((f) => input.disclosedFactIds.has(f.id))
    .map((f) => ({ factId: f.id, text: f.answer.mn, significance: f.significance?.mn }));
  const missedFindings = significant
    .filter((f) => !input.disclosedFactIds.has(f.id))
    .map((f) => ({ factId: f.id, text: f.answer.mn, significance: f.significance?.mn }));

  const seen = new Set<string>();
  let repeated = 0;
  for (const q of input.questions) {
    const key = [...q.topics].sort().join("|");
    if (key && seen.has(key)) repeated++;
    if (key) seen.add(key);
  }
  const questionStats = {
    total: input.questions.length,
    clinical: input.questions.filter((q) => q.topics.length > 0 && q.mode !== "injection" && q.mode !== "diagnosis_request").length,
    repeated,
    unclear: input.questions.filter((q) => q.mode === "clarify").length,
    diagnosisRequests: input.questions.filter((q) => q.mode === "diagnosis_request").length,
  };

  const missedCritical = items.filter((i) => i.critical && !i.covered);
  const summaryParts = [
    `Та нийт ${questionStats.total} асуулт асууж, үнэлгээний ${items.length} гол асуултын ${items.filter((i) => i.covered).length}-ийг хамарлаа.`,
    `Чухал асуултын ${critical.covered}/${critical.total}-ийг асуусан.`,
    `Онош: ${VERDICT_TEXT[diagnosis.verdict]}.`,
  ];
  if (missedCritical.length > 0) {
    summaryParts.push(`Дараагийн удаа заавал асуух: ${missedCritical.map((i) => i.label.toLowerCase()).join("; ")}.`);
  } else {
    summaryParts.push("Бүх чухал асуултыг асуусан нь сайн байна.");
  }

  return {
    version: EVALUATOR_VERSION,
    caseId: c.id,
    caseVersion: c.version,
    weights,
    totalScore,
    diagnosis: {
      ...diagnosis,
      submitted: input.diagnosisText,
      expected: c.hidden.diagnosis.label.mn,
      expectedEn: c.hidden.diagnosis.label.en,
      explanation: c.education.explanation.mn,
    },
    components: { diagnosis: diagnosisComponent, history, critical },
    items,
    categories,
    discoveredFindings,
    missedFindings,
    questionStats,
    learningPoints: c.education.learningPoints.map((p) => p.mn),
    differentials: c.hidden.differentials.map((d) => ({ label: d.label.mn, rationale: d.rationale.mn })),
    emergencyNote: c.education.emergency?.escalation.mn,
    summary: summaryParts.join(" "),
  };
}

export const RUBRIC_CATEGORY_LABELS: Record<RubricCategory, string> = {
  hpi: "Одоогийн өвчний түүх",
  associated_symptoms: "Хавсарсан шинж тэмдэг",
  pertinent_negatives: "Чухал сөрөг шинж",
  past_history: "Өмнөх өвчин",
  medications_allergies: "Эм ба харшил",
  family_history: "Удамшил",
  social_history: "Нийгмийн түүх",
  risk_factors: "Эрсдэлт хүчин зүйл",
  red_flags: "Аюулын шинж",
};
