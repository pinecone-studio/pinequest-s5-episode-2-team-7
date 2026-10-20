import "server-only";
import { getConfig } from "@/lib/config";
import type { EvaluationResult } from "@/lib/evaluation/evaluator";
import { ChatModelProvider } from "@/lib/patient/providers/base";
import { getPatientProvider } from "@/lib/patient/providers";

/**
 * Optional LLM-written feedback paragraph (FEEDBACK_NARRATIVE=llm).
 *
 * Grounding: the model receives only the deterministic evaluation (scores,
 * covered/missed rubric items with the student's own questions) — never the
 * full case — and the output is validated. It cannot change the score: the
 * score is computed and stored before this runs, and a reply mentioning a
 * different total is discarded.
 */
export async function generateFeedbackNarrative(result: EvaluationResult, reasoning?: string): Promise<{ text: string; provider: string } | null> {
  if (getConfig().FEEDBACK_NARRATIVE !== "llm") return null;
  const provider = getPatientProvider();
  if (!(provider instanceof ChatModelProvider)) return null;

  const facts = {
    totalScore: result.totalScore,
    diagnosis: { submitted: result.diagnosis.submitted, expected: result.diagnosis.expected, verdict: result.diagnosis.verdict },
    studentReasoning: reasoning?.slice(0, 800) ?? "",
    asked: result.items.filter((i) => i.covered).map((i) => ({ item: i.label, critical: i.critical, studentQuestion: i.evidence?.text })),
    missed: result.items.filter((i) => !i.covered).map((i) => ({ item: i.label, critical: i.critical, why: i.rationale })),
  };
  const system = [
    "Чи анагаахын багш. Оюутны эмнэлзүйн асуумжид монгол хэлээр 4–6 өгүүлбэр бүхий урам өгсөн, тодорхой санал бич.",
    "Зөвхөн өгөгдсөн JSON-д байгаа баримтад тулгуурла; шинэ эмнэлзүйн мэдээлэл бүү зохио.",
    "Оюутны бодит асуултаас иш тат. Нийт оноог өөрчилж, шинэ оноо бүү тооцоол.",
    "Энэ нь эмнэлзүйн зөвлөгөө биш, сургалтын санал гэдгийг санаарай.",
  ].join("\n");
  const text = (
    await provider.complete({ system, messages: [{ role: "user", content: JSON.stringify(facts) }], maxTokens: 500, temperature: 0.4 })
  ).trim();

  const cyrillic = (text.match(/\p{Script=Cyrillic}/gu) ?? []).length;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (!text || text.length > 1500 || letters === 0 || cyrillic / letters < 0.6) return null;
  const mentionedScores = [...text.matchAll(/(\d{1,3}(?:[.,]\d)?)\s*(?:оноо|\/\s*100)/g)].map((m) => Number(m[1].replace(",", ".")));
  if (mentionedScores.some((s) => Math.abs(s - result.totalScore) > 0.5)) return null;
  return { text, provider: `${provider.id}:${provider.model}` };
}
