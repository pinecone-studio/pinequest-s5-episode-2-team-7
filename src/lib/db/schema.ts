import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { PatientCase } from "@/lib/cases/schema";
import type { EvaluationResult } from "@/lib/evaluation/evaluator";
import type { CoachDebrief, CoachLine, CoachPack } from "@/lib/coach/types";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["student", "admin"] }).notNull().default("student"),
  createdAt: createdAt(),
});

/** Structured cases. `data` holds the full PRIVATE case — server-side only. */
export const cases = pgTable(
  "cases",
  {
    id: text("id").primaryKey(),
    version: integer("version").notNull().default(1),
    status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
    title: text("title").notNull(),
    specialty: text("specialty").notNull(),
    difficulty: text("difficulty").notNull(),
    data: jsonb("data").$type<PatientCase>().notNull(),
    source: text("source").notNull(),
    license: text("license").notNull(),
    synthetic: boolean("synthetic").notNull(),
    trainingUseAllowed: boolean("training_use_allowed").notNull().default(false),
    reviewStatus: text("review_status").notNull().default("unreviewed"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cases_status_idx").on(t.status)],
);

export const interviewSessions = pgTable(
  "interview_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "restrict" }),
    caseVersion: integer("case_version").notNull(),
    /** Frozen copy of the case so evaluation is reproducible after edits. */
    caseSnapshot: jsonb("case_snapshot").$type<PatientCase>().notNull(),
    status: text("status", { enum: ["active", "completed", "abandoned"] }).notNull().default("active"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    questionCount: integer("question_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("sessions_user_idx").on(t.userId, t.startedAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    role: text("role", { enum: ["student", "patient", "narrator"] }).notNull(),
    content: text("content").notNull(),
    /** Student messages: classified topics and the engine mode. */
    topics: jsonb("topics").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    mode: text("mode"),
    classifierSource: text("classifier_source"),
    /** Patient messages: facts disclosed by this answer. */
    disclosedFactIds: jsonb("disclosed_fact_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    provider: text("provider"),
    model: text("model"),
    fallbackUsed: boolean("fallback_used").notNull().default(false),
    fallbackReason: text("fallback_reason"),
    validationIssues: jsonb("validation_issues").$type<{ code: string; detail: string }[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("messages_session_seq_idx").on(t.sessionId, t.seq)],
);

export const disclosedFacts = pgTable(
  "disclosed_facts",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    factId: text("fact_id").notNull(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.factId] })],
);

export const diagnosisSubmissions = pgTable("diagnosis_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => interviewSessions.id, { onDelete: "cascade" }),
  diagnosis: text("diagnosis").notNull(),
  reasoning: text("reasoning"),
  createdAt: createdAt(),
});

export const evaluations = pgTable("evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => interviewSessions.id, { onDelete: "cascade" }),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => diagnosisSubmissions.id, { onDelete: "cascade" }),
  evaluatorVersion: text("evaluator_version").notNull(),
  totalScore: real("total_score").notNull(),
  diagnosisVerdict: text("diagnosis_verdict").notNull(),
  result: jsonb("result").$type<EvaluationResult>().notNull(),
  /** Optional LLM-written prose. Never changes scores. */
  narrative: text("narrative"),
  narrativeProvider: text("narrative_provider"),
  createdAt: createdAt(),
});

/** Interview transcripts or generated dialogues proposed as training data. */
export const trainingExamples = pgTable(
  "training_examples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => interviewSessions.id, { onDelete: "set null" }),
    source: text("source", { enum: ["session", "synthetic"] }).notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    /** Turn records: question, classified topics, disclosed fact ids, answer. */
    data: jsonb("data").$type<TrainingTurn[]>().notNull(),
    notes: text("notes"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("training_session_idx").on(t.sessionId)],
);

export interface TrainingTurn {
  question: string;
  topics: string[];
  mode: string | null;
  disclosedFactIds: string[];
  answer: string;
  provider: string | null;
}

/** Registered model versions (e.g. fine-tuned adapters) and their metadata. */
export const modelRegistry = pgTable("model_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  adapterId: text("adapter_id"),
  baseModel: text("base_model"),
  trainingRunId: text("training_run_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  notes: text("notes"),
  createdAt: createdAt(),
});

/**
 * Health news written by admins or imported (machine-translated) from RSS
 * feeds; students only see published articles. Imports start as drafts.
 */
export const newsArticles = pgTable(
  "news_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    body: text("body").notNull(),
    category: text("category").notNull().default("general"),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    /** Picture the feed itself publishes for the item (media:content / thumbnail / enclosure). */
    imageUrl: text("image_url"),
    origin: text("origin", { enum: ["manual", "rss"] }).notNull().default("manual"),
    /** Untranslated headline of an imported article, for the reviewing admin. */
    originalTitle: text("original_title"),
    status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One row per source link, so repeated imports never duplicate an article.
  (t) => [index("news_status_idx").on(t.status, t.publishedAt), uniqueIndex("news_source_url_idx").on(t.sourceUrl)],
);

/**
 * AI дасгалжуулагч: an employer (owner) makes a team, shares its join code
 * with new staff, gives them challenges (a practice persona + target score)
 * and sees every result. Packs made from a company's own material live in
 * `coach_packs` (private to the owner, or shared with one team).
 */
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("team_members_user_idx").on(t.userId)],
);

export const coachPacks = pgTable(
  "coach_packs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** The full pack, hidden facts included — server-side only. */
    data: jsonb("data").$type<CoachPack>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("coach_packs_owner_idx").on(t.ownerId, t.createdAt)],
);

export const challenges = pgTable(
  "challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    /** A built-in pack id ("callcenter") or a coach_packs id. */
    packRef: text("pack_ref").notNull(),
    title: text("title").notNull(),
    mode: text("mode", { enum: ["video", "audio"] }).notNull().default("audio"),
    difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] }).notNull().default("medium"),
    targetScore: integer("target_score").notNull().default(70),
    dueAt: timestamp("due_at", { withTimezone: true }),
    /** Time for one attempt (overrides the pack's own limit); null = the pack's limit. */
    timeLimitSec: integer("time_limit_sec"),
    /** Attempts each assignee gets; null = unlimited practice. */
    maxAttempts: integer("max_attempts"),
    /** Who must take it (user ids); null = every member of the team. */
    assignees: jsonb("assignees").$type<string[]>(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("challenges_team_idx").on(t.teamId, t.createdAt)],
);

export const coachResults = pgTable(
  "coach_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    challengeId: uuid("challenge_id").references(() => challenges.id, { onDelete: "set null" }),
    packRef: text("pack_ref").notNull(),
    packTitle: text("pack_title").notNull(),
    mode: text("mode").notNull(),
    difficulty: text("difficulty").notNull(),
    score: integer("score").notNull(),
    durationSec: integer("duration_sec").notNull(),
    debrief: jsonb("debrief").$type<CoachDebrief>().notNull(),
    transcript: jsonb("transcript").$type<CoachLine[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("coach_results_user_idx").on(t.userId, t.createdAt), index("coach_results_team_idx").on(t.teamId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type CaseRow = typeof cases.$inferSelect;
export type SessionRow = typeof interviewSessions.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type NewsArticleRow = typeof newsArticles.$inferSelect;
