/**
 * AI дасгалжуулагч: shared shapes. Safe to import from client components —
 * but a full `CoachPack` holds the persona's hidden facts and rules, so only
 * `PublicPack` (see `publicPack`) is ever sent to the browser or the app.
 */

/** Emotion tags the persona can put on a reply (same ids as the patient's emotions). */
export const COACH_EMOTIONS = ["calm", "worried", "in_pain", "scared", "panicked", "angry"] as const;
export type CoachEmotion = (typeof COACH_EMOTIONS)[number];

export const COACH_MODES = ["video", "audio"] as const;
export type CoachMode = (typeof COACH_MODES)[number];

export const COACH_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type CoachDifficulty = (typeof COACH_DIFFICULTIES)[number];

export interface RubricItem {
  id: string;
  label: string;
}

/** One practice persona with everything the AI needs to play and grade it. */
export interface CoachPack {
  id: string;
  /** "patient" | "student" | ... for built-ins, "custom" for packs made from a company's material. */
  kind: string;
  title: string;
  subtitle: string;
  /** Emoji shown on cards. */
  icon: string;
  /** Who practises ("call center-ийн шинэ ажилтан"). */
  traineeRole: string;
  defaultMode: CoachMode;
  /** Language the persona speaks (and the trainee answers in). */
  language: "mn" | "en";
  gender: "female" | "male";
  maxSec: number;
  /** Medical/emergency content that a professional must still check. */
  draft?: boolean;
  /** Shown to the trainee before starting (never reveals hidden facts). */
  brief: string;
  persona: { name: string; age: number; description: string };
  situation: string;
  goal: string;
  hidden: string[];
  rules: string[];
  opening: string;
  openingEmotion: CoachEmotion;
  fillers: string[];
  /** Facts from the company's material (custom packs): the trainee's answers are checked against them. */
  facts?: string[];
  rubric: RubricItem[];
  gradingNotes?: string;
  orgName?: string;
}

/** What the browser and the app may see of a pack. */
export interface PublicPack {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  icon: string;
  traineeRole: string;
  defaultMode: CoachMode;
  language: "mn" | "en";
  gender: "female" | "male";
  maxSec: number;
  draft: boolean;
  brief: string;
  personaName: string;
  opening: string;
  openingEmotion: CoachEmotion;
  fillers: string[];
  rubric: RubricItem[];
  factCount: number;
  orgName: string | null;
  /** Custom packs: the team it was shared with (null = private to its owner). */
  teamId: string | null;
}

export function publicPack(p: CoachPack, teamId: string | null = null): PublicPack {
  return {
    id: p.id,
    kind: p.kind,
    title: p.title,
    subtitle: p.subtitle,
    icon: p.icon,
    traineeRole: p.traineeRole,
    defaultMode: p.defaultMode,
    language: p.language,
    gender: p.gender,
    maxSec: p.maxSec,
    draft: Boolean(p.draft),
    brief: p.brief,
    personaName: p.persona.name,
    opening: p.opening,
    openingEmotion: p.openingEmotion,
    fillers: p.fillers,
    rubric: p.rubric,
    factCount: p.facts?.length ?? 0,
    orgName: p.orgName ?? null,
    teamId,
  };
}

/** One line of a practice conversation. `t` = seconds since the start. */
export interface CoachLine {
  role: "me" | "ai";
  text: string;
  t: number;
}

export interface CoachDebrief {
  score: number;
  summary: string;
  rubric: { id: string; label: string; result: "yes" | "partial" | "no"; evidence: string }[];
  strengths: string[];
  improvements: string[];
  betterLines: { said: string; better: string }[];
  factErrors: string[];
}

/** Events of the streamed reply (NDJSON, one per line). */
export type TurnEvent =
  | { t: "emo"; v: CoachEmotion }
  | { t: "say"; text: string }
  | { t: "end" }
  | { t: "done"; text: string }
  | { t: "error"; error: string };
