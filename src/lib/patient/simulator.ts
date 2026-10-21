import type { PatientCase } from "@/lib/cases/schema";
import { classifyQuestion, type Classification } from "./classifier";
import { buildTurnContext, type TranscriptTurn } from "./context";
import { planTurn, type TurnPlan } from "./engine";
import { renderNarratorNote } from "./narrator";
import { cleanReply } from "./providers/base";
import { renderMockReply } from "./providers/mock";
import { ProviderError, type PatientProvider, type ProviderId } from "./providers/types";
import { splitSentences } from "./sentences";
import { isTopicId } from "./topics";
import { validatePatientReply, type ValidationIssue } from "./validator";

export interface SimulatorOptions {
  provider: PatientProvider;
  /** `mock` → answer from templates when the provider fails; `none` → throw. */
  fallback: "mock" | "none";
  /** `hybrid` → ask the provider to classify when keywords find nothing. */
  intentMode: "keyword" | "hybrid";
  timeoutMs?: number;
  /**
   * Receives each sentence of the model's reply as soon as it is complete and
   * the reply up to it passes validation — so it can be voiced while the rest
   * is still being written. Never called for template (mock/fallback) text.
   */
  onSentence?: (sentence: string) => void;
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

  const validate = (reply: string) => validatePatientReply({ reply, patientCase: input.patientCase, plan, ctx, disclosedFactIds: input.disclosedFactIds });
  const early = options.onSentence ? earlySentences(validate, options.onSentence) : null;

  let reply: string | null = null;
  let failure: string | undefined;
  let issues: ValidationIssue[] = [];
  try {
    reply = (await withTimeout((signal) => provider.generate(ctx, { signal, onText: early?.push }), timeoutMs)).trim();
    issues = validate(reply);
    if (issues.length > 0) failure = `validation: ${issues.map((i) => i.code).join(",")}`;
  } catch (error) {
    failure = error instanceof ProviderError ? `${error.kind}: ${error.message}` : error instanceof Error && error.name === "AbortError" ? "timeout" : "provider_error";
  }

  if (!failure && reply) {
    early?.finish(reply);
    return { patientText: reply, narratorText, plan, classification, provider: provider.id, model: provider.model, fallbackUsed: false, validationIssues: [] };
  }

  // Sentences already voiced passed validation on their own: keep exactly
  // those (the student has heard them) instead of switching to a template.
  if (early && early.emitted.length > 0) {
    return {
      patientText: early.emitted.join(" "),
      narratorText,
      plan,
      classification,
      provider: provider.id,
      model: provider.model,
      fallbackUsed: false,
      fallbackReason: `${provider.id}: truncated after ${early.emitted.length} sentence(s) (${failure})`,
      validationIssues: issues,
    };
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

/**
 * Releases complete sentences of a streaming reply one by one, each only if
 * the reply up to and including it passes validation. Stops at the first
 * sentence that fails; `finish` releases whatever is left of a valid reply.
 */
export function earlySentences(validate: (text: string) => ValidationIssue[], emit: (sentence: string) => void) {
  const emitted: string[] = [];
  let blocked = false;
  const clean = (text: string) => cleanReply(text).replace(/^["«“]/, "");
  return {
    emitted,
    push(soFar: string) {
      if (blocked) return;
      const parts = splitSentences(clean(soFar));
      // The last part may still be growing; everything before it is final.
      for (let i = emitted.length; i < parts.length - 1; i++) {
        if (validate([...emitted, parts[i]].join(" ")).length > 0) {
          blocked = true;
          return;
        }
        emitted.push(parts[i]);
        emit(parts[i]);
      }
    },
    finish(full: string) {
      if (blocked) return;
      const text = full.replace(/\s+/g, " ").trim();
      const said = emitted.join(" ");
      const rest = text.startsWith(said) ? text.slice(said.length).trim() : emitted.length === 0 ? text : "";
      if (rest) {
        emitted.push(rest);
        emit(rest);
      }
    },
  };
}

export function openingMessage(patientCase: PatientCase): string {
  return patientCase.public.openingLine.mn;
}
