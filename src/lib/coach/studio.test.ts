import { describe, expect, it } from "vitest";
import { StudioInputSchema, buildStudioPack, weightedScore } from "./studio";

describe("avatar studio", () => {
  const input = StudioInputSchema.parse({
    title: "Борлуулагчийн ярилцлага",
    personaName: "Сарнай",
    role: "interviewer",
    mood: "strict",
    questions: ["Өөрийгөө танилцуулна уу.", "Яагаад манайд ажиллах гэж байна вэ?"],
    knowledge: "- Ажлын цаг 09:00–18:00\n- Хөнгөлөлт 10%\n",
    rubric: [
      { label: "Тодорхой хариулсан", weight: 3 },
      { label: "Эелдэг харилцсан", weight: 1 },
    ],
    timeLimitMin: 4,
  });

  it("builds a pack that asks the manager's questions in order", () => {
    const pack = buildStudioPack(input);
    expect(pack.studio).toBe(true);
    expect(pack.questions).toEqual(input.questions);
    expect(pack.maxSec).toBe(240);
    expect(pack.opening).toContain(input.questions[0]);
    expect(pack.facts).toEqual(["Ажлын цаг 09:00–18:00", "Хөнгөлөлт 10%"]);
    expect(pack.rubric.map((r) => [r.id, r.weight])).toEqual([["r1", 3], ["r2", 1]]);
    expect(pack.rules.join(" ")).toContain("дарааллаар");
  });

  it("uses default criteria when none are given", () => {
    const pack = buildStudioPack({ ...input, rubric: [], role: "customer" });
    expect(pack.rubric.length).toBeGreaterThan(3);
    expect(pack.rubric.every((r) => (r.weight ?? 0) >= 1)).toBe(true);
  });

  it("scores by the weights", () => {
    const rubric = buildStudioPack(input).rubric;
    expect(weightedScore(rubric, [{ id: "r1", result: "yes" }, { id: "r2", result: "no" }])).toBe(75);
    expect(weightedScore(rubric, [{ id: "r1", result: "partial" }, { id: "r2", result: "yes" }])).toBe(63);
    expect(weightedScore(rubric, [])).toBeNull();
  });
});
