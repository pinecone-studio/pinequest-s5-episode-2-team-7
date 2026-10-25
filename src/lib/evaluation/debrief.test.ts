import { describe, expect, it } from "vitest";
import { loadDemoCase } from "@/lib/cases/demo";
import { fallbackDebrief } from "./debrief";
import { evaluateInterview } from "./evaluator";

const chestPain = loadDemoCase("chest-pain-01");
const evaluate = (diagnosisText: string) => evaluateInterview({ patientCase: chestPain, questions: [], disclosedFactIds: new Set(), diagnosisText });

describe("fallbackDebrief", () => {
  it("takes verdict, score and missed questions from the evaluation, critical first", () => {
    const result = evaluate("миокардын шигдээс");
    const debrief = fallbackDebrief(result);
    expect(debrief.verdict).toBe("correct");
    expect(debrief.score).toBe(Math.round(result.totalScore));
    expect(debrief.missed.length).toBe(result.items.length);
    const firstNonCritical = debrief.missed.findIndex((m) => !m.critical);
    expect(debrief.missed.slice(firstNonCritical).every((m) => !m.critical)).toBe(true);
    expect(debrief.source).toBe("rubric");
  });

  it("calls a differential or empty answer incorrect", () => {
    expect(fallbackDebrief(evaluate("перикардит")).verdict).toBe("incorrect");
    expect(fallbackDebrief(evaluate("")).verdict).toBe("incorrect");
  });

  it("always has 2–3 follow-up questions, even with nothing missed and no differentials", () => {
    const result = evaluate("миокардын шигдээс");
    const perfect = { ...result, items: result.items.map((i) => ({ ...i, covered: true })), differentials: [] };
    for (const r of [result, perfect]) {
      const { followUps } = fallbackDebrief(r);
      expect(followUps.length).toBeGreaterThanOrEqual(2);
      expect(followUps.length).toBeLessThanOrEqual(3);
      expect(new Set(followUps).size).toBe(followUps.length);
    }
    expect(fallbackDebrief(perfect).missed).toEqual([]);
  });
});
