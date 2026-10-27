import { describe, expect, it } from "vitest";
import { ARTICLES, factOfTheDay, findArticle } from "./knowledge";
import { applyEffect, danger, SCENARIOS, scoreOf } from "./scenarios";

describe("emergency cases (ported from the iOS app)", () => {
  it("has the app's three cases, each step with exactly one best answer", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(["accident", "chestpain", "anaphylaxis"]);
    for (const s of SCENARIOS) {
      for (const step of s.steps) {
        expect(step.options.filter((o) => o.grade === "best"), `${s.id}/${step.id}`).toHaveLength(1);
        expect(step.findings.length).toBeGreaterThan(0);
      }
    }
  });

  it("links only to articles that exist", () => {
    for (const s of SCENARIOS) for (const id of s.learnMore) expect(findArticle(id), `${s.id} → ${id}`).toBeDefined();
  });

  it("scores all-best as 100, overtime costs 2 each, never below 0", () => {
    const s = SCENARIOS[0];
    const best = Object.fromEntries(s.steps.map((step) => [step.id, step.options.find((o) => o.grade === "best")!]));
    expect(scoreOf(s, best, 0)).toBe(100);
    expect(scoreOf(s, best, 1)).toBe(Math.round(((s.steps.length * 10 - 2) / (s.steps.length * 10)) * 100));
    const worst = Object.fromEntries(s.steps.map((step) => [step.id, step.options.find((o) => o.grade === "harmful") ?? step.options.at(-1)!]));
    expect(scoreOf(s, worst, 5)).toBeGreaterThanOrEqual(0);
  });

  it("clamps vitals like the app", () => {
    const v = applyEffect({ hr: 100, sys: 100, dia: 60, spo2: 98, rr: 16, gcs: 15 }, { spo2: 10, gcs: 5, hr: -500 });
    expect(v).toMatchObject({ spo2: 100, gcs: 15, hr: 0 });
    expect(danger({ hr: 140, sys: 80, dia: 50, spo2: 85, rr: 32, gcs: 10 })).toBe(1);
  });
});

describe("knowledge articles", () => {
  it("have unique ids and a fact of the day", () => {
    expect(new Set(ARTICLES.map((a) => a.id)).size).toBe(ARTICLES.length);
    expect(factOfTheDay(new Date("2026-10-27")).fact.length).toBeGreaterThan(0);
  });
});
