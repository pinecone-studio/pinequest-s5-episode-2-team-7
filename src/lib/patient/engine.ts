import type { CaseFact, PatientCase } from "@/lib/cases/schema";
import type { Classification } from "./classifier";
import { getTopic, type TopicId } from "./topics";

/**
 * Disclosure engine — decides WHAT the patient may say this turn.
 *
 * The language model never decides what to disclose: it only receives the
 * facts this plan allows (see ./context.ts) and turns them into natural
 * speech. Everything here is deterministic and unit-tested.
 */

export type TurnMode =
  | "answer" // answer specific topics
  | "chief_complaint" // confirm the presenting complaint
  | "broad" // open/broad question → limited, patient-like answer
  | "diagnosis_request" // student asks the patient for the diagnosis
  | "injection" // prompt-injection / out-of-character attempt
  | "greeting" // greeting only
  | "identity" // name / age
  | "exam" // examination or vitals requested (narrator reports)
  | "clarify"; // question not understood

export interface InterviewState {
  disclosedFactIds: ReadonlySet<string>;
  /** Number of student questions already asked this session. */
  turnIndex: number;
}

export interface TurnPlan {
  mode: TurnMode;
  topics: TopicId[];
  greeting: boolean;
  /** Patient-known facts the patient may state this turn. */
  facts: CaseFact[];
  /** Subset of `facts` that were already disclosed earlier. */
  repeatedFactIds: string[];
  /** Fact ids disclosed for the first time this turn. */
  newlyDisclosedIds: string[];
  /** Symptom topics absent from the case → consistent negative answer. */
  absentTopics: TopicId[];
  /** History/HPI topics the case does not cover → uncertainty, no invention. */
  unknownTopics: TopicId[];
  /** Exam / vitals / investigation facts reported by the narrator. */
  narratorFacts: CaseFact[];
  /** Requested investigations are not part of this simulation. */
  investigationsUnavailable: boolean;
  /** More topics were asked than answered in one turn. */
  overflow: boolean;
  /**
   * Topics the patient actually addressed this turn (stated a fact, denied an
   * absent symptom, said "don't know", confirmed the complaint, or the
   * narrator reported). Topics cut off by MAX_FACTS_PER_TURN are excluded, so
   * the evaluator cannot be gamed with keyword-stuffed questions.
   */
  answeredTopics: TopicId[];
}

/** Max patient-known facts stated in one answer (prevents "info dumps"). */
export const MAX_FACTS_PER_TURN = 4;
/** Max facts volunteered for a broad/open question. */
export const MAX_BROAD_FACTS = 2;

const EXAM_TOPICS = new Set<TopicId>(["vitals", "physical_exam", "investigations"]);

function emptyPlan(mode: TurnMode, topics: TopicId[]): TurnPlan {
  return {
    mode,
    topics,
    greeting: topics.includes("greeting"),
    facts: [],
    repeatedFactIds: [],
    newlyDisclosedIds: [],
    absentTopics: [],
    unknownTopics: [],
    narratorFacts: [],
    investigationsUnavailable: false,
    overflow: false,
    answeredTopics: [],
  };
}

function finalize(plan: TurnPlan, state: InterviewState): TurnPlan {
  plan.repeatedFactIds = plan.facts.filter((f) => state.disclosedFactIds.has(f.id)).map((f) => f.id);
  plan.newlyDisclosedIds = [...plan.facts, ...plan.narratorFacts].filter((f) => !state.disclosedFactIds.has(f.id)).map((f) => f.id);
  return plan;
}

export function planTurn(patientCase: PatientCase, classification: Classification, state: InterviewState): TurnPlan {
  const topics = classification.topics;
  const facts = patientCase.hidden.facts;

  // 1. Safety first: injection and diagnosis requests disclose nothing.
  if (topics.includes("injection")) return emptyPlan("injection", topics);
  if (topics.includes("diagnosis_request")) return emptyPlan("diagnosis_request", topics);

  const specific = topics.filter((t) => {
    const kind = getTopic(t)?.kind;
    return kind === "hpi" || kind === "symptom" || kind === "history" || t === "concerns";
  });
  const examTopics = topics.filter((t) => EXAM_TOPICS.has(t));

  // 2. Specific clinical questions.
  if (specific.length > 0 || examTopics.length > 0) {
    const plan = emptyPlan("answer", topics);
    const chosen: CaseFact[] = [];
    const ccTopics = new Set<string>(patientCase.public.chiefComplaintTopics);
    const factsByTopic = new Map<TopicId, CaseFact[]>();
    const answered: TopicId[] = [];
    let ccOnly = true;

    for (const topicId of specific) {
      const matching = facts.filter((f) => f.patientKnows && f.topics.includes(topicId));
      if (matching.length > 0) {
        ccOnly = false;
        factsByTopic.set(topicId, matching);
        for (const fact of matching) if (!chosen.includes(fact)) chosen.push(fact);
        continue;
      }
      answered.push(topicId); // complaint confirmed, symptom denied or "don't know"
      if (ccTopics.has(topicId)) continue; // asking "do you have <chief complaint>?"
      ccOnly = false;
      const kind = getTopic(topicId)?.kind;
      if (kind === "symptom") plan.absentTopics.push(topicId);
      else plan.unknownTopics.push(topicId);
    }

    if (chosen.length > MAX_FACTS_PER_TURN) {
      plan.overflow = true;
      chosen.length = MAX_FACTS_PER_TURN;
    }
    plan.facts = chosen;
    for (const [topicId, matching] of factsByTopic) {
      if (matching.some((f) => chosen.includes(f))) answered.push(topicId);
    }

    for (const topicId of examTopics) {
      if (topicId === "investigations" && !patientCase.hidden.investigationsAvailable) {
        plan.investigationsUnavailable = true;
        continue;
      }
      for (const fact of facts) {
        if (!fact.patientKnows && fact.topics.includes(topicId) && !plan.narratorFacts.includes(fact)) {
          plan.narratorFacts.push(fact);
        }
      }
      answered.push(topicId);
    }
    plan.answeredTopics = topics.filter((t) => answered.includes(t));

    if (specific.length === 0) plan.mode = "exam";
    else if (ccOnly && plan.facts.length === 0) plan.mode = "chief_complaint";
    return finalize(plan, state);
  }

  // 3. Open questions: volunteer a little, never everything.
  if (topics.includes("associated_general") || topics.includes("broad")) {
    const plan = emptyPlan("broad", topics);
    const wantsAssociated = topics.includes("associated_general");
    const candidates = facts.filter(
      (f) =>
        f.patientKnows &&
        !state.disclosedFactIds.has(f.id) &&
        (wantsAssociated ? f.topics.includes("associated_general") : f.volunteerOnBroad),
    );
    plan.facts = candidates.slice(0, MAX_BROAD_FACTS);
    plan.answeredTopics = topics.filter((t) => t === "associated_general" || t === "broad");
    return finalize(plan, state);
  }

  if (topics.includes("identity")) return emptyPlan("identity", topics);
  if (topics.includes("greeting")) return emptyPlan("greeting", topics);
  return emptyPlan("clarify", topics);
}
