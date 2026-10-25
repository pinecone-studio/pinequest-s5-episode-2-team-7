import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDemoCases } from "@/lib/cases/demo";
import { findOfflineCase } from "@/lib/demo/offline-cases";
import source from "../../data/scenarios.json";
import { ScenarioFile, listScenarios, type Scenario } from "./scenarios";

const { scenarios } = ScenarioFile.parse(source);
const cases = new Map(loadDemoCases().map((c) => [c.id, c]));
const publicDir = fileURLToPath(new URL("../../public", import.meta.url));

/** Whole-word match that also works for Cyrillic (\b is ASCII-only). */
function mentions(text: string, term: string): boolean {
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(text.toLowerCase());
}

describe("data/scenarios.json", () => {
  it("has unique ids", () => {
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
  });

  it.each(scenarios.map((s) => [s.id, s] as const))("%s points at real data", (_id, s) => {
    expect(cases.has(s.caseId), `case ${s.caseId}`).toBe(true);
    expect(existsSync(`${publicDir}${s.panorama}`), `panorama ${s.panorama}`).toBe(true);
    if (s.offlineCaseId) expect(findOfflineCase(s.offlineCaseId), `offline ${s.offlineCaseId}`).toBeDefined();
  });

  it.each(scenarios.map((s) => [s.id, s] as const))("%s never names the diagnosis or a differential", (_id, s) => {
    const c = cases.get(s.caseId)!;
    const terms = [
      c.hidden.diagnosis.label.mn,
      ...c.hidden.diagnosis.acceptedAliases,
      ...(c.hidden.diagnosis.partialAliases ?? []),
      ...c.hidden.differentials.flatMap((d) => [d.label.mn, ...d.aliases]),
    ];
    const text = [s.title, s.intro, s.family.who, ...s.family.lines].join("\n");
    expect(terms.filter((term) => mentions(text, term))).toEqual([]);
  });
});

describe("listScenarios", () => {
  const fixture = [{ id: "a", roles: ["ambulance"] }, { id: "b", roles: ["nurse"] }] as Scenario[];

  it("filters by role", () => {
    expect(listScenarios("nurse", fixture).map((s) => s.id)).toEqual(["b"]);
    expect(listScenarios("doctor", fixture)).toEqual([]);
  });

  it("shows students every scenario", () => {
    expect(listScenarios("student", fixture).map((s) => s.id)).toEqual(["a", "b"]);
  });
});
