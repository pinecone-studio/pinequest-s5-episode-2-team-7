// Shared by the speech layer (one audio part per sentence) and the simulator
// (sentences are checked and voiced one by one while the reply streams in).

/**
 * Splits a reply into spoken parts at sentence ends so the first sentence can
 * be voiced and played while the rest is still being synthesized. Very short
 * pieces ("Тийм.") are merged with the next one to keep requests few.
 */
export function splitSentences(text: string, minChars = 12): string[] {
  const sentences = text
    .trim()
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean);
  const parts: string[] = [];
  for (const sentence of sentences) {
    const last = parts.at(-1);
    if (last !== undefined && last.length < minChars) parts[parts.length - 1] = `${last} ${sentence}`;
    else parts.push(sentence);
  }
  if (parts.length > 1 && parts.at(-1)!.length < minChars) parts[parts.length - 2] += ` ${parts.pop()}`;
  return parts;
}
