import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { PatientCase } from "@/lib/cases/schema";
import type { EvaluationResult } from "@/lib/evaluation/evaluator";

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

/** Health news written by admins; students only see published articles. */
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
    status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("news_status_idx").on(t.status, t.publishedAt)],
);

export type User = typeof users.$inferSelect;
export type CaseRow = typeof cases.$inferSelect;
export type SessionRow = typeof interviewSessions.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type NewsArticleRow = typeof newsArticles.$inferSelect;
