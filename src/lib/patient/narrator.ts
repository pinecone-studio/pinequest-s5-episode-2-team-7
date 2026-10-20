import type { TurnPlan } from "./engine";

/**
 * Exam findings and vitals are not patient knowledge, so they are reported
 * by a neutral narrator (rendered differently in the UI) and never by the
 * language model.
 */
export function renderNarratorNote(plan: TurnPlan): string | null {
  const parts: string[] = [];
  if (plan.narratorFacts.length > 0) {
    parts.push(...plan.narratorFacts.map((f) => f.answer.mn));
  }
  if (plan.investigationsUnavailable) {
    parts.push("Энэ симуляц нь асуумж цуглуулах дадлагад зориулагдсан тул шинжилгээний хариу өгөгдөхгүй. Асуумжаараа оношоо дэмжинэ үү.");
  }
  if (plan.mode === "exam" && parts.length === 0) {
    parts.push("Энэ тохиолдолд үзлэгийн нэмэлт мэдээлэл байхгүй.");
  }
  return parts.length > 0 ? parts.join("\n") : null;
}
