import type { PatientCase } from "@/lib/cases/schema";
import { normalizeQuestion } from "./classifier";
import type { PatientTurnContext } from "./context";
import type { TurnPlan } from "./engine";

/**
 * Server-side check of an LLM-written patient answer. The guard is built from
 * the private case and never leaves the server. If a reply fails, the
 * simulator discards it and answers from the reviewed templates instead.
 */

export type ValidationIssueCode =
  | "empty"
  | "too_long"
  | "not_mongolian"
  | "diagnosis_leak"
  | "speculation"
  | "undisclosed_fact"
  | "out_of_character"
  | "contradiction"
  | "ungrounded";

export interface ValidationIssue {
  code: ValidationIssueCode;
  detail: string;
}

export const MAX_REPLY_CHARS = 600;

/** Frequent Mongolian words that say nothing about a fact's content. */
const COMMON_STEMS = new Set(["бай", "эмч", "тий", "үгү", "гэж", "бол", "нэг", "мэд", "хэл", "одо", "энэ", "тэр", "бас", "жаа", "маш", "дээ", "гэс"]);

const OUT_OF_CHARACTER = [
  /\bai\b/,
  /language model/,
  /assistant/,
  /system prompt/,
  /\bjson\b/,
  /хиймэл оюун/,
  /хэлний загвар/,
  /зөвшөөрсөн мэдээлэл/,
  /даалгавар/,
  /дүрэм/,
  /pq-patient/,
  /##/,
];

/**
 * Negation: the "-гүй" suffix must end a word ("өвдөхгүй", "үгүй", optionally
 * "-гүй ээ/гээ"), so words that merely start with "гүй" ("гүйх" = to run) do
 * not count as a denial.
 */
const NEGATION = /\p{L}гүй(?=\s|$|ээ|гээ)|(^|\s)(алга|биш|no|not)(?=\s|$)/u;

function containsTerm(haystack: string, term: string): boolean {
  const t = normalizeQuestion(term);
  if (t.length < 2) return false;
  // Short latin abbreviations (mi, pe, acs) must match as whole tokens.
  if (/^[a-z0-9 ]+$/.test(t) && t.length <= 4) {
    return new RegExp(`(^|\\s)${t}(\\s|$)`).test(haystack);
  }
  return haystack.includes(t);
}

export function validatePatientReply(args: {
  reply: string;
  patientCase: PatientCase;
  plan: TurnPlan;
  ctx: PatientTurnContext;
  disclosedFactIds: ReadonlySet<string>;
}): ValidationIssue[] {
  const { reply, patientCase: c, plan, ctx } = args;
  const issues: ValidationIssue[] = [];
  const text = reply.trim();
  if (!text) return [{ code: "empty", detail: "Хоосон хариулт" }];
  if (text.length > MAX_REPLY_CHARS) issues.push({ code: "too_long", detail: `${text.length} тэмдэгт` });

  const letters = text.match(/\p{L}/gu) ?? [];
  const cyrillic = text.match(/\p{Script=Cyrillic}/gu) ?? [];
  if (letters.length > 0 && cyrillic.length / letters.length < 0.6) {
    issues.push({ code: "not_mongolian", detail: "Монгол (кирилл) текст биш" });
  }

  const normalized = normalizeQuestion(text);
  // Anything the patient may legitimately say this turn or has already said.
  const allowedText = normalizeQuestion(
    [...ctx.share.map((s) => s.text), ...ctx.alreadyShared, ...ctx.deny, ctx.openingLine, ctx.chiefComplaint, ctx.question].join(" "),
  );

  const diagnosisTerms = [c.hidden.diagnosis.label.mn, c.hidden.diagnosis.label.en ?? "", ...c.hidden.diagnosis.acceptedAliases, ...c.hidden.diagnosis.partialAliases];
  for (const term of diagnosisTerms) {
    if (term && containsTerm(normalized, term) && !containsTerm(allowedText, term)) {
      issues.push({ code: "diagnosis_leak", detail: `Онош дурдсан: "${term}"` });
      break;
    }
  }

  const differentialTerms = c.hidden.differentials.flatMap((d) => [d.label.mn, ...d.aliases]);
  for (const term of differentialTerms) {
    if (term && containsTerm(normalized, term) && !containsTerm(allowedText, term)) {
      issues.push({ code: "speculation", detail: `Ялган онош дурдсан: "${term}"` });
      break;
    }
  }

  const allowedFactIds = new Set([...plan.facts.map((f) => f.id), ...args.disclosedFactIds]);
  for (const fact of c.hidden.facts) {
    if (allowedFactIds.has(fact.id)) continue;
    const leaked = fact.leakTerms.find((term) => containsTerm(normalized, term) && !containsTerm(allowedText, term));
    if (leaked) {
      issues.push({ code: "undisclosed_fact", detail: `Асуугаагүй баримт (${fact.id}): "${leaked}"` });
    }
  }

  for (const pattern of OUT_OF_CHARACTER) {
    if (pattern.test(normalized) && !pattern.test(normalizeQuestion(ctx.question))) {
      issues.push({ code: "out_of_character", detail: `Дүрээс гарсан: ${pattern.source}` });
      break;
    }
  }

  // Grounding: when facts are being shared, the reply must reuse at least one
  // content word from them (3-letter stems tolerate Mongolian suffixes;
  // very common words are ignored). Catches fluent-looking replies that
  // ignore the allowed facts.
  if (ctx.share.length > 0) {
    const stemsOf = (text: string) =>
      normalizeQuestion(text)
        .split(" ")
        .filter((w) => w.length >= 4)
        .map((w) => w.slice(0, 3))
        .filter((stem) => !COMMON_STEMS.has(stem));
    const stems = new Set(stemsOf(ctx.share.map((s) => s.text).join(" ")));
    const replyStems = stemsOf(text);
    if (stems.size > 0 && !replyStems.some((s) => stems.has(s))) {
      issues.push({ code: "ungrounded", detail: "Зөвшөөрсөн баримтын агуулга хариултад алга" });
    }
  }

  // An absent symptom must be denied; the reply must contain a negation.
  if (ctx.deny.length > 0 && ctx.share.length === 0 && !NEGATION.test(normalized)) {
    issues.push({ code: "contradiction", detail: "Байхгүй шинж тэмдгийг үгүйсгээгүй" });
  }
  return issues;
}
