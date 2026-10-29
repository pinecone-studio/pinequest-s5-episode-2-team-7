import { describe, expect, it } from "vitest";
import { BUILTIN_PACKS, builtinPack } from "./packs";
import { COACH_EMOTIONS, COACH_MODES, publicPack, type CoachPack } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("built-in coach packs", () => {
  it("have unique, URL-safe ids that can never be mistaken for a custom pack's uuid", () => {
    const ids = BUILTIN_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      // Used as-is in links such as /coach?pack=<id>.
      expect(id).toMatch(/^[a-z0-9_-]+$/);
      // resolvePack() checks built-ins first, so a uuid-looking id would shadow a custom pack.
      expect(id).not.toMatch(UUID_RE);
    }
  });

  it.each(BUILTIN_PACKS.map((p): [string, CoachPack] => [p.id, p]))("%s is complete", (_id, p) => {
    for (const text of [p.kind, p.title, p.subtitle, p.icon, p.traineeRole, p.brief, p.situation, p.goal, p.opening, p.persona.name, p.persona.description]) {
      expect(text.trim()).not.toBe("");
    }
    expect(COACH_MODES).toContain(p.defaultMode);
    expect(COACH_EMOTIONS).toContain(p.openingEmotion);
    expect(["mn", "en"]).toContain(p.language);
    expect(["female", "male"]).toContain(p.gender);
    expect(p.maxSec).toBeGreaterThan(0);
    expect(p.persona.age).toBeGreaterThan(0);
    expect(p.hidden.length).toBeGreaterThan(0);
    expect(p.rules.length).toBeGreaterThan(0);

    expect(p.rubric.length).toBeGreaterThan(0);
    const rubricIds = p.rubric.map((r) => r.id);
    expect(new Set(rubricIds).size).toBe(rubricIds.length);
    for (const r of p.rubric) expect(r.label.trim()).not.toBe("");
  });

  it("mark medical and emergency content as a draft until a professional reviews it", () => {
    for (const p of BUILTIN_PACKS.filter((x) => x.kind === "patient" || x.kind === "dispatch")) {
      expect(p.draft, p.id).toBe(true);
    }
  });

  it("are found by id, and unknown ids are not", () => {
    for (const p of BUILTIN_PACKS) expect(builtinPack(p.id)).toBe(p);
    expect(builtinPack("no-such-pack")).toBeUndefined();
    expect(builtinPack("")).toBeUndefined();
  });

  it("never send hidden facts, rules or grading notes to the browser", () => {
    for (const p of BUILTIN_PACKS) {
      const sent = JSON.stringify(publicPack(p));
      for (const secret of [...p.hidden, ...p.rules, p.situation, p.gradingNotes ?? ""].filter(Boolean)) {
        expect(sent, `${p.id}: ${secret.slice(0, 40)}`).not.toContain(secret);
      }
    }
  });
});
