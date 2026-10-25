import type { EvaluationResult } from "./evaluator";

/**
 * «Шүүлэгч»: the verdict, score and missed questions come from the
 * deterministic evaluation; the summary and follow-up questions may be
 * written by a model (source "model") or built here from the rubric
 * (source "rubric"), so the debrief is never empty — also offline.
 */
export interface Debrief {
  verdict: "correct" | "partial" | "incorrect";
  score: number;
  expected: string;
  missed: { label: string; question: string; critical: boolean }[];
  summary: string;
  followUps: string[];
  source: "model" | "rubric";
}

const GENERIC_FOLLOW_UPS = [
  "Энэ өвчтөнд яаралтай ямар шинжилгээ хийж, юуг хамгийн түрүүнд шалгах вэ?",
  "Эмчилгээний эхний алхам юу байх вэ, яагаад?",
  "Өвчтөн болон ар гэрийнхэнд нь юуг хэрхэн тайлбарлах вэ?",
];

export function debriefVerdict(verdict: EvaluationResult["diagnosis"]["verdict"]): Debrief["verdict"] {
  if (verdict === "correct") return "correct";
  if (verdict === "partial") return "partial";
  return "incorrect";
}

export function fallbackDebrief(result: EvaluationResult): Debrief {
  const missed = result.items
    .filter((i) => !i.covered)
    .sort((a, b) => Number(b.critical) - Number(a.critical))
    .map((i) => ({ label: i.label, question: i.suggestedQuestion, critical: i.critical }));
  const fromDifferentials = result.differentials.slice(0, 2).map((d) => `«${d.label}»-ээс хэрхэн ялгах вэ? Ямар асуулт, шинжилгээ тус болох вэ?`);
  const followUps = [...fromDifferentials, ...GENERIC_FOLLOW_UPS].slice(0, 3);
  return {
    verdict: debriefVerdict(result.diagnosis.verdict),
    score: Math.round(result.totalScore),
    expected: result.diagnosis.expected,
    missed,
    summary: result.summary,
    followUps,
    source: "rubric",
  };
}
