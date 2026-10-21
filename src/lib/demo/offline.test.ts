import { describe, expect, it } from "vitest";
import { findOfflineCase } from "./offline-cases";
import { evaluateOffline, offlineBackend, startOfflineSession } from "./offline";

describe("offline demo", () => {
  it("answers a diagnosis request in character without revealing anything", async () => {
    startOfflineSession("offline-chest-pain");
    const backend = offlineBackend("offline-chest-pain");
    const { messages } = await backend.ask("Таны онош юу вэ?");
    const reply = messages.find((m) => m.role === "patient")!.content;
    expect(reply).toContain("Мэдэхгүй ээ, эмч ээ");
    expect(reply).not.toMatch(/шигдээс|зүрх/);
  });

  it("counts diagnosis requests separately from clinical questions", () => {
    const c = findOfflineCase("offline-chest-pain")!;
    const result = evaluateOffline(
      c,
      [
        { id: "1", text: "Хэзээ эхэлсэн бэ?", intents: ["onset"] },
        { id: "2", text: "Таны онош юу вэ?", intents: ["diagnosis_request"] },
      ],
      "Зүрхний шигдээс",
    );
    expect(result.questionStats.diagnosisRequests).toBe(1);
    expect(result.questionStats.clinical).toBe(1);
    expect(result.diagnosis.verdict).toBe("correct");
  });
});
