import { describe, expect, it } from "vitest";

import { loadDemoCases, DEMO_CASE_SOURCES } from "./demo";
import { toPublicCase, PRIVATE_CASE_KEYS } from "./public";
import { validateCase } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests mutate raw JSON freely
type Json = Record<string, any>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe("case schema", () => {
  it("accepts all bundled demonstration cases", () => {
    const cases = loadDemoCases();
    expect(cases).toHaveLength(3);
    for (const c of cases) {
      expect(c.provenance.synthetic).toBe(true);
      expect(c.rubric.items.some((i) => i.critical)).toBe(true);
    }
  });

  it("returns readable, path-specific errors for an invalid import", () => {
    const broken = clone(DEMO_CASE_SOURCES[0]) as Json;
    delete broken.hidden.diagnosis;
    broken.id = "Bad ID!";
    broken.hidden.facts[0].topics = ["not_a_topic"];

    const result = validateCase(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const paths = result.issues.map((i) => i.path);
    expect(paths).toContain("id");
    expect(paths).toContain("hidden.diagnosis");
    expect(paths.some((p) => p.startsWith("hidden.facts.0.topics"))).toBe(true);
    expect(result.issues.every((i) => i.message.length > 0)).toBe(true);
  });

  it("rejects a case whose public title reveals the diagnosis", () => {
    const leaky = clone(DEMO_CASE_SOURCES[0]) as Json;
    leaky.public.displayTitle.mn = "Зүрхний шигдээстэй эрэгтэй";
    const result = validateCase(leaky);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.path === "public")).toBe(true);
  });

  it("rejects exam findings marked as patient-known", () => {
    const bad = clone(DEMO_CASE_SOURCES[0]) as Json;
    const vital = bad.hidden.facts.find((f: { kind: string }) => f.kind === "vital");
    vital.patientKnows = true;
    expect(validateCase(bad).ok).toBe(false);
  });

  it("rejects duplicate fact ids and score weights that do not sum to 1", () => {
    const bad = clone(DEMO_CASE_SOURCES[1]) as Json;
    bad.hidden.facts[1].id = bad.hidden.facts[0].id;
    bad.rubric.weights = { diagnosis: 0.5, history: 0.5, critical: 0.5 };
    const result = validateCase(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.message.includes("Давхардсан"))).toBe(true);
      expect(result.issues.some((i) => i.path.startsWith("rubric.weights"))).toBe(true);
    }
  });
});

describe("public case view", () => {
  it("never contains hidden diagnosis, facts, rubric or persona", () => {
    for (const c of loadDemoCases()) {
      const publicCase = toPublicCase(c);
      const serialized = JSON.stringify(publicCase);
      for (const key of PRIVATE_CASE_KEYS) {
        expect(serialized).not.toContain(`"${key}"`);
      }
      for (const alias of c.hidden.diagnosis.acceptedAliases.filter((a) => a.length > 4)) {
        expect(serialized.toLowerCase()).not.toContain(alias.toLowerCase());
      }
      for (const fact of c.hidden.facts) {
        expect(serialized).not.toContain(fact.answer.mn);
      }
    }
  });
});
