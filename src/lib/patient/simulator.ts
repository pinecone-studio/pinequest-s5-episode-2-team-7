import type { PatientCase } from "@/lib/cases/schema";
import { classifyQuestion, type Classification } from "./classifier";
import { buildTurnContext, type TranscriptTurn } from "./context";
import { planTurn, type TurnPlan } from "./engine";
import { renderNarratorNote } from "./narrator";
import { renderMockReply } from "./providers/mock";
import { ProviderError, type PatientProvider, type ProviderId } from "./providers/types";
import { isTopicId } from "./topics";
import { validatePatientReply, type ValidationIssue } from "./validator";

export interface SimulatorOptions {
  provider: PatientProvider;
  /** `mock` → answer from templates when the provider fails; `none` → throw. */
  fallback: "mock" | "none";
  /** `hybrid` → ask the provider to classify when keywords find nothing. */
  intentMode: "keyword" | "hybrid";
  timeoutMs?: number;
}

export interface TurnInput {
  patientCase: PatientCase;
  question: string;
  disclosedFactIds: ReadonlySet<string>;
  /** Prior student/patient turns (excluding the opening line and narrator notes). */
  history: TranscriptTurn[];
  turnIndex: number;
  /** Optional emotional state for this turn (see emotions.ts). */
  emotionalState?: string;
}

export interface TurnResult {
  patientText: string;
  narratorText: string | null;
  plan: TurnPlan;
  classification: Classification;
  provider: ProviderId;
  model: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  validationIssues: ValidationIssue[];
}

export class SimulatorError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SimulatorError";
  }
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function simulateTurn(input: TurnInput, options: SimulatorOptions): Promise<TurnResult> {
  const { provider } = options;
  const timeoutMs = options.timeoutMs ?? 20_000;

  // 1. Understand the question (deterministic first).
  let classification = classifyQuestion(input.question);
  if (classification.topics.length === 0 && options.intentMode === "hybrid" && provider.classifyTopics) {
    try {
      const topics = await withTimeout((signal) => provider.classifyTopics!(input.question, { signal }), timeoutMs);
      const valid = topics.filter(isTopicId);
      if (valid.length > 0) classification = { ...classification, topics: valid, source: "llm" };
    } catch {
      // Classification is best-effort; fall through to "clarify".
    }
  }

  // 2. Decide what may be disclosed.
  const plan = planTurn(input.patientCase, classification, {
    disclosedFactIds: input.disclosedFactIds,
    turnIndex: input.turnIndex,
  });
  const ctx = buildTurnContext({
    emotionalState: input.emotionalState,
    patientCase: input.patientCase,
    plan,
    question: input.question,
    alreadySharedFactIds: input.disclosedFactIds,
    history: input.history,
  });
  const narratorText = renderNarratorNote(plan);

  // 3. Phrase it. The mock provider needs no validation: it only joins
  //    reviewed case wording.
  if (provider.id === "mock") {
    return {
      patientText: renderMockReply(ctx),
      narratorText,
      plan,
      classification,
      provider: provider.id,
      model: provider.model,
      fallbackUsed: false,
      validationIssues: [],
    };
  }

  let reply: string | null = null;
  let failure: string | undefined;
  let issues: ValidationIssue[] = [];
  try {
    reply = (await withTimeout((signal) => provider.generate(ctx, { signal }), timeoutMs)).trim();
    issues = validatePatientReply({ reply, patientCase: input.patientCase, plan, ctx, disclosedFactIds: input.disclosedFactIds });
    if (issues.length > 0) failure = `validation: ${issues.map((i) => i.code).join(",")}`;
  } catch (error) {
    failure = error instanceof ProviderError ? `${error.kind}: ${error.message}` : error instanceof Error && error.name === "AbortError" ? "timeout" : "provider_error";
  }

  if (!failure && reply) {
    return { patientText: reply, narratorText, plan, classification, provider: provider.id, model: provider.model, fallbackUsed: false, validationIssues: [] };
  }

  if (options.fallback === "none") {
    throw new SimulatorError(`Patient provider "${provider.id}" failed (${failure})`);
  }
  return {
    patientText: renderMockReply(ctx),
    narratorText,
    plan,
    classification,
    provider: "mock",
    model: "templates-v1",
    fallbackUsed: true,
    fallbackReason: `${provider.id}: ${failure}`,
    validationIssues: issues,
  };
}

export function openingMessage(patientCase: PatientCase): string {
  return patientCase.public.openingLine.mn;
}
