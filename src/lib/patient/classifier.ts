import { TOPICS, type TopicDefinition, type TopicId } from "./topics";

/** Lower-case, strip punctuation and collapse whitespace. Keeps digits. */
export function normalizeQuestion(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[“”«»"'`’‘]/g, " ")
    .replace(/[?!.,;:()[\]{}<>…–—/\\|*_#@~^+=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Classification {
  /** Matched topics in the order they appear in the question. */
  topics: TopicId[];
  /** Normalised text that was classified. */
  normalized: string;
  /** How the topics were obtained. */
  source: "keyword" | "llm" | "none";
}

function firstMatchIndex(topic: TopicDefinition, text: string): number {
  let best = -1;
  for (const pattern of topic.patterns) {
    const match = pattern.exec(text);
    if (match && (best === -1 || match.index < best)) best = match.index;
  }
  return best;
}

/**
 * Deterministic keyword classifier over the shared topic taxonomy. It is the
 * first (and in `keyword` mode the only) step of question understanding, so
 * its behaviour is fully reproducible in tests and in the evaluator.
 */
export function classifyQuestion(question: string): Classification {
  const normalized = normalizeQuestion(question);
  if (!normalized) return { topics: [], normalized, source: "none" };

  const hits = new Map<TopicId, number>();
  for (const topic of TOPICS) {
    const index = firstMatchIndex(topic, normalized);
    if (index === -1) continue;
    if (topic.exclude?.some((pattern) => pattern.test(normalized))) continue;
    hits.set(topic.id, index);
  }

  // Suppression is evaluated against the original hit set so the result does
  // not depend on taxonomy order.
  const matched = new Set<string>(hits.keys());
  for (const topic of TOPICS) {
    if (!hits.has(topic.id)) continue;
    const suppressors = "suppressedBy" in topic ? (topic.suppressedBy as readonly string[] | undefined) : undefined;
    if (suppressors?.some((id) => matched.has(id))) hits.delete(topic.id);
  }

  const topics = [...hits.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  return { topics, normalized, source: topics.length > 0 ? "keyword" : "none" };
}
