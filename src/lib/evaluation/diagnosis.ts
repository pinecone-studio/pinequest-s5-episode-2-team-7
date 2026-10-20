import type { PatientCase } from "@/lib/cases/schema";

/**
 * Deterministic diagnosis matching against reviewed aliases. No language
 * model is involved in deciding correctness.
 */

export type DiagnosisVerdict = "correct" | "partial" | "differential" | "incorrect" | "empty";

export interface DiagnosisMatch {
  verdict: DiagnosisVerdict;
  /** 1 correct, 0.5 partial, 0 otherwise. */
  score: number;
  matchedTerm?: string;
  /** The alias matched only approximately (typo tolerance). */
  fuzzy: boolean;
  /** Correct diagnosis was listed, but not first. */
  notLeading: boolean;
  /** Which differential was named, if any. */
  differential?: string;
}

export function normalizeDiagnosis(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/[“”«»"'`’‘()[\]{}.!?:]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split "A, B эсвэл C" into candidate diagnoses, leading one first. */
export function splitCandidates(text: string): string[] {
  return text
    .split(/[,;\n/]|\s(?:эсвэл|буюу|or|vs)\s|\d+\s*[.)]/i)
    .map((part) => normalizeDiagnosis(part))
    .filter((part) => part.length > 0);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Does `candidate` contain `alias` (exactly, as tokens, or with a small typo)? */
function aliasMatch(candidate: string, aliasRaw: string): "exact" | "fuzzy" | null {
  const alias = normalizeDiagnosis(aliasRaw);
  if (!alias) return null;
  const padded = ` ${candidate} `;
  if (padded.includes(` ${alias} `)) return "exact";
  // Mongolian suffixes: allow the alias as a prefix of the last word
  // ("хатгалгаатай", "шигдээсийн").
  if (alias.length >= 5 && /[а-яөүё]/.test(alias) && padded.includes(` ${alias}`)) return "exact";
  if (alias.length < 6) return null;

  const words = candidate.split(" ");
  const span = alias.split(" ").length;
  for (let i = 0; i + span <= words.length; i++) {
    const window = words.slice(i, i + span).join(" ");
    const distance = levenshtein(window, alias);
    if (distance / alias.length <= 0.15) return "fuzzy";
  }
  return null;
}

function findAlias(candidate: string, aliases: string[]): { alias: string; kind: "exact" | "fuzzy" } | null {
  // Prefer longer, more specific aliases and exact matches.
  const sorted = [...aliases].sort((a, b) => b.length - a.length);
  let fuzzy: { alias: string; kind: "fuzzy" } | null = null;
  for (const alias of sorted) {
    const kind = aliasMatch(candidate, alias);
    if (kind === "exact") return { alias, kind };
    if (kind === "fuzzy" && !fuzzy) fuzzy = { alias, kind };
  }
  return fuzzy;
}

export function matchDiagnosis(patientCase: PatientCase, submitted: string): DiagnosisMatch {
  const candidates = splitCandidates(submitted);
  if (candidates.length === 0) return { verdict: "empty", score: 0, fuzzy: false, notLeading: false };

  const { acceptedAliases, partialAliases, label } = patientCase.hidden.diagnosis;
  const accepted = [...acceptedAliases, label.mn, ...(label.en ? [label.en] : [])];

  for (let i = 0; i < candidates.length; i++) {
    const hit = findAlias(candidates[i], accepted);
    if (hit) {
      if (i === 0) return { verdict: "correct", score: 1, matchedTerm: hit.alias, fuzzy: hit.kind === "fuzzy", notLeading: false };
      return { verdict: "partial", score: 0.5, matchedTerm: hit.alias, fuzzy: hit.kind === "fuzzy", notLeading: true };
    }
  }

  const partial = findAlias(candidates[0], partialAliases);
  if (partial) return { verdict: "partial", score: 0.5, matchedTerm: partial.alias, fuzzy: partial.kind === "fuzzy", notLeading: false };

  for (const differential of patientCase.hidden.differentials) {
    const hit = findAlias(candidates[0], [differential.label.mn, ...(differential.label.en ? [differential.label.en] : []), ...differential.aliases]);
    if (hit) return { verdict: "differential", score: 0, matchedTerm: hit.alias, fuzzy: hit.kind === "fuzzy", notLeading: false, differential: differential.label.mn };
  }
  return { verdict: "incorrect", score: 0, fuzzy: false, notLeading: false };
}
