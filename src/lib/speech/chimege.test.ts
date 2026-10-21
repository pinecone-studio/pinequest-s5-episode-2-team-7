import { describe, expect, it } from "vitest";
import { splitForSpeech, splitSentences } from "./chimege";

describe("speech text splitting", () => {
  it("splits a reply into sentences, merging very short ones", () => {
    expect(splitSentences("Өнөө өглөө долоон цагт эхэлсэн. Тийм. Зүүн гар руу дамжаад байна!")).toEqual([
      "Өнөө өглөө долоон цагт эхэлсэн.",
      "Тийм. Зүүн гар руу дамжаад байна!",
    ]);
    expect(splitSentences("Мэдэхгүй ээ.")).toEqual(["Мэдэхгүй ээ."]);
    expect(splitSentences("Үгүй. Байхгүй.")).toEqual(["Үгүй. Байхгүй."]);
  });

  it("keeps Chimege requests under the length limit", () => {
    const long = "Маш урт өгүүлбэр, ".repeat(30);
    for (const part of splitForSpeech(long)) expect(part.length).toBeLessThanOrEqual(200);
  });
});
