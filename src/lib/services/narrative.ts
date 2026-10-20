import "server-only";
import type { EvaluationResult } from "@/lib/evaluation/evaluator";

/**
 * Optional LLM-written feedback paragraph (FEEDBACK_NARRATIVE=llm).
 * Implemented together with the hosted providers; returns null otherwise.
 */
export async function generateFeedbackNarrative(_result: EvaluationResult, _reasoning?: string): Promise<{ text: string; provider: string } | null> {
  return null;
}
