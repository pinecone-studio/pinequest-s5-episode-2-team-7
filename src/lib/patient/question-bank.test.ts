import { describe, expect, it } from "vitest";
import bank from "../../../data/question-bank/mn.json";
import { classifyQuestion } from "./classifier";
import { TOPIC_IDS } from "./topics";

const entries = Object.entries(bank).filter(([key]) => !key.startsWith("_")) as [string, string[]][];

describe("Mongolian question bank", () => {
  it("covers every topic in the taxonomy", () => {
    const covered = new Set(entries.map(([topic]) => topic));
    expect(TOPIC_IDS.filter((t) => !covered.has(t))).toEqual([]);
  });

  it.each(entries)("paraphrases of %s are classified to that topic", (topic, questions) => {
    for (const q of questions) {
      expect(classifyQuestion(q).topics, q).toContain(topic);
    }
  });
});
