import type { PatientTurnContext } from "../context";
import type { PatientProvider, ProviderHealth } from "./types";

/**
 * Deterministic template-based patient. Uses exactly the same restricted
 * context as the LLM providers, so it exercises the real disclosure path.
 *
 * Limitations: answers are the case author's reviewed wording joined
 * together; it does not paraphrase, vary tone or react emotionally beyond a
 * few fixed phrases, and it cannot understand questions the keyword
 * classifier misses.
 */

function pick(variants: readonly string[], seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return variants[hash % variants.length];
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase("mn") + text.slice(1);
}

const GREETINGS = ["Сайн байна уу, эмч ээ.", "Сайн, сайн байна уу, эмч ээ."];
const CLARIFY = [
  "Уучлаарай, эмч ээ, сайн ойлгосонгүй. Арай өөрөөр асуугаад өгөөч?",
  "Юу гэсэн үг вэ, эмч ээ? Би сайн ойлгосонгүй.",
];
const DIAGNOSIS = [
  "Мэдэхгүй ээ, эмч ээ. Тийм болохоор л танд үзүүлэх гэж ирсэн шүү дээ. Та л хэлж өгөөч.",
  "Би яаж мэдэх вэ дээ, эмч ээ. Та л шалгаад хэлж өгнө биз дээ.",
];
const NOTHING_ELSE = [
  "Өөр онцгой зүйл санаанд орохгүй байна, эмч ээ. Та асуугаад байгаарай, би хариулъя.",
  "Одоохондоо өөр хэлэх зүйл бодогдохгүй байна. Та юу мэдэхийг хүсэж байна?",
];
const UNKNOWN = ["Үүнийг сайн мэдэхгүй юм байна, эмч ээ.", "Энэ талаар хэлж мэдэхгүй нь, эмч ээ."];
const EXAM_OK = ["За, эмч ээ, үзээрэй.", "За тэгье, эмч ээ."];
const OVERFLOW = "Бусдыг нь нэг нэгээр нь асуувал би сайн хариулъя.";

export function renderMockReply(ctx: PatientTurnContext): string {
  const seed = `${ctx.question}|${ctx.history.length}`;
  const parts: string[] = [];
  if (ctx.greeting && ctx.mode !== "greeting") parts.push(pick(GREETINGS, seed));

  switch (ctx.mode) {
    case "injection":
      return `Уучлаарай, эмч ээ, таны юу хэлээд байгааг ойлгосонгүй. Би ${lowerFirst(ctx.chiefComplaint)} зовиураар л ирсэн юм.`;
    case "diagnosis_request":
      return pick(DIAGNOSIS, seed);
    case "greeting":
      return pick(GREETINGS, seed);
    case "identity":
      return `Намайг ${ctx.persona.name} гэдэг. ${ctx.persona.age} настай.`;
    case "clarify":
      return pick(CLARIFY, seed);
    case "chief_complaint":
      parts.push(`Тийм ээ, эмч ээ. ${ctx.openingLine.replace(/^Эмч ээ,?\s*/i, "").replace(/^Сайн байна уу, эмч ээ\.\s*/i, "")}`);
      return parts.join(" ");
    case "exam":
      if (ctx.share.length === 0 && ctx.deny.length === 0 && ctx.unknown.length === 0) {
        parts.push(pick(EXAM_OK, seed));
        return parts.join(" ");
      }
      break;
    case "broad":
      if (ctx.share.length === 0) {
        parts.push(pick(NOTHING_ELSE, seed));
        return parts.join(" ");
      }
      break;
    case "answer":
      break;
  }

  ctx.share.forEach((item, i) => {
    parts.push(item.repeated && i === 0 ? `Түрүүн хэлсэнчлэн, ${lowerFirst(item.text)}` : item.text);
  });
  parts.push(...ctx.deny);
  if (ctx.unknown.length > 0) parts.push(pick(UNKNOWN, seed));
  if (ctx.overflow) parts.push(OVERFLOW);
  if (parts.length === 0) parts.push(pick(CLARIFY, seed));
  return parts.join(" ");
}

export class MockPatientProvider implements PatientProvider {
  readonly id = "mock" as const;
  readonly model = "templates-v1";
  readonly label = "Демо горим (загвар текст)";

  async generate(ctx: PatientTurnContext): Promise<string> {
    return renderMockReply(ctx);
  }

  async health(): Promise<ProviderHealth> {
    return { ok: true, provider: this.id, model: this.model, detail: "Гадаад сервисгүй, үргэлж бэлэн." };
  }
}
