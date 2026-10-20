import { describe, expect, it } from "vitest";
import { loadDemoCase } from "@/lib/cases/demo";
import { PROMPT_FORMAT_VERSION } from "../context";
import { simulateTurn } from "../simulator";
import { parseTopicList, TOPIC_CLASSIFIER_SYSTEM } from "./base";
import { FineTunedPatientProvider } from "./finetuned";
import { GeminiPatientProvider } from "./gemini";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { ProviderError } from "./types";

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function fakeFetch(handler: Handler) {
  const calls: { url: string; body?: unknown }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return handler(url, init);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const chest = loadDemoCase("chest-pain-01");

describe("Gemini provider", () => {
  it("sends the restricted prompt and returns the text", async () => {
    const { impl, calls } = fakeFetch(() => json({ candidates: [{ content: { parts: [{ text: "Тийм ээ, гучаад жил татаж байна." }] } }] }));
    const provider = new GeminiPatientProvider("key", "gemini-3.8-flash", impl);
    const result = await simulateTurn(
      { patientCase: chest, question: "Тамхи татдаг уу?", disclosedFactIds: new Set(), history: [], turnIndex: 0 },
      { provider, fallback: "mock", intentMode: "keyword" },
    );
    expect(result.patientText).toBe("Тийм ээ, гучаад жил татаж байна.");
    expect(result.provider).toBe("gemini");
    const body = JSON.stringify(calls[0].body);
    expect(body).not.toContain(chest.hidden.diagnosis.label.mn);
    expect(body).not.toContain("зүүн гар");
    expect(body).toContain("хайрцаг");
    expect(calls[0].url).toContain("gemini-3.8-flash:generateContent");
  });

  it("maps quota errors and missing keys to provider errors", async () => {
    const { impl } = fakeFetch(() => json({ error: {} }, 429));
    await expect(new GeminiPatientProvider("key", "gemini-3.8-flash", impl).complete({ system: "s", messages: [{ role: "user", content: "q" }], maxTokens: 10 })).rejects.toMatchObject({
      kind: "rate_limit",
    });
    expect(() => new GeminiPatientProvider("", "gemini-3.8-flash")).toThrow(ProviderError);
  });

  it("keeps Google's error message for diagnostics", async () => {
    const { impl } = fakeFetch(() => json({ error: { message: "This model models/gemini-2.5-flash is no longer available to new users." } }, 404));
    await expect(new GeminiPatientProvider("key", "gemini-2.5-flash", impl).complete({ system: "s", messages: [{ role: "user", content: "q" }], maxTokens: 10 })).rejects.toThrow(
      "Gemini HTTP 404: This model models/gemini-2.5-flash is no longer available to new users.",
    );
  });
});

describe("OpenAI-compatible provider", () => {
  it("strips <think> blocks and posts to /chat/completions", async () => {
    const { impl, calls } = fakeFetch(() => json({ choices: [{ message: { content: "<think>hmm</think>Өнөө өглөө эхэлсэн." } }] }));
    const provider = new OpenAICompatibleProvider("http://localhost:11434/v1/", "qwen3:4b", undefined, impl);
    const text = await provider.complete({ system: "s", messages: [{ role: "user", content: "q" }], maxTokens: 10 });
    expect(text).toBe("Өнөө өглөө эхэлсэн.");
    expect(calls[0].url).toBe("http://localhost:11434/v1/chat/completions");
  });
});

describe("fine-tuned provider", () => {
  it("refuses to answer when the inference service reports a different adapter", async () => {
    const { impl } = fakeFetch((url) => (url.endsWith("/health") ? json({ adapter_id: "old-adapter", base_model: "base", prompt_format: PROMPT_FORMAT_VERSION }) : json({})));
    const provider = new FineTunedPatientProvider("http://gpu:8000/v1", "pinequest-patient", undefined, "pq-lora-v2", impl);
    const health = await provider.health();
    expect(health.ok).toBe(false);
    await expect(provider.complete({ system: "s", messages: [{ role: "user", content: "q" }], maxTokens: 10 })).rejects.toMatchObject({ kind: "unverified_model" });

    const result = await simulateTurn(
      { patientCase: chest, question: "Тамхи татдаг уу?", disclosedFactIds: new Set(), history: [], turnIndex: 0 },
      { provider, fallback: "mock", intentMode: "keyword" },
    );
    expect(result.fallbackUsed).toBe(true);
    expect(result.provider).toBe("mock");
    expect(result.fallbackReason).toContain("unverified_model");
  });

  it("answers after the adapter and prompt format are verified", async () => {
    const { impl, calls } = fakeFetch((url) =>
      url.endsWith("/health")
        ? json({ adapter_id: "pq-lora-v2", base_model: "Qwen/Qwen3-4B", prompt_format: PROMPT_FORMAT_VERSION })
        : json({ choices: [{ message: { content: "Тийм, татдаг." } }] }),
    );
    const provider = new FineTunedPatientProvider("http://gpu:8000/v1", "pinequest-patient", "secret", "pq-lora-v2", impl);
    const result = await simulateTurn(
      { patientCase: chest, question: "Тамхи татдаг уу?", disclosedFactIds: new Set(), history: [], turnIndex: 0 },
      { provider, fallback: "none", intentMode: "keyword" },
    );
    expect(result.provider).toBe("finetuned");
    expect(result.fallbackUsed).toBe(false);
    expect(calls.map((c) => c.url)).toEqual(["http://gpu:8000/health", "http://gpu:8000/v1/chat/completions"]);
  });
});

describe("hybrid intent classification", () => {
  it("parses topic lists defensively", () => {
    expect(parseTopicList('```json\n["smoking", "nope", "smoking"]\n```')).toEqual(["smoking"]);
    expect(parseTopicList("I think it is smoking")).toEqual([]);
    expect(TOPIC_CLASSIFIER_SYSTEM).not.toContain("шигдээс");
  });

  it("uses the model's topic label only when keywords find nothing", async () => {
    const { impl, calls } = fakeFetch((_url, init) => {
      const body = JSON.parse(String(init?.body));
      const isClassifier = body.messages[0].content.startsWith("You label");
      return json({ choices: [{ message: { content: isClassifier ? '["smoking"]' : "Тийм ээ, гучаад жил татаж байна." } }] });
    });
    const provider = new OpenAICompatibleProvider("http://llm/v1", "m", undefined, impl);
    const result = await simulateTurn(
      { patientCase: chest, question: "Янжуур уудаг уу?", disclosedFactIds: new Set(), history: [], turnIndex: 0 },
      { provider, fallback: "mock", intentMode: "hybrid" },
    );
    expect(result.classification.source).toBe("llm");
    expect(result.plan.facts.map((f) => f.id)).toEqual(["smoking"]);
    // The classifier request never contains case data.
    expect(JSON.stringify(calls[0].body)).not.toContain("хайрцаг");
  });
});
