import "server-only";
import { desc, eq } from "drizzle-orm";
import { Errors } from "@/lib/api/http";
import { loadDemoCases } from "@/lib/cases/demo";
import { toPublicCase, type PublicCase } from "@/lib/cases/public";
import { validateCase, type PatientCase } from "@/lib/cases/schema";
import { getDb } from "@/lib/db/client";
import { cases, type CaseRow } from "@/lib/db/schema";

export type CaseStatus = "draft" | "published" | "archived";

function rowValues(c: PatientCase) {
  return {
    title: c.public.displayTitle.mn,
    specialty: c.public.specialty,
    difficulty: c.public.difficulty,
    data: c,
    source: c.provenance.source,
    license: c.provenance.license,
    synthetic: c.provenance.synthetic,
    trainingUseAllowed: c.provenance.trainingUseAllowed,
    reviewStatus: c.provenance.clinicalReview.status,
  };
}

/** Published cases as safe public views for students. */
export async function listPublishedCases(): Promise<PublicCase[]> {
  const db = await getDb();
  const rows = await db.select({ data: cases.data }).from(cases).where(eq(cases.status, "published")).orderBy(cases.createdAt);
  return rows.map((r) => toPublicCase(r.data));
}

export async function getPublishedCase(id: string): Promise<PatientCase> {
  const db = await getDb();
  const [row] = await db.select().from(cases).where(eq(cases.id, id));
  if (!row || row.status !== "published") throw Errors.notFound("Кейс");
  return row.data;
}

// ------------------------------------------------------------- admin ----

export interface AdminCaseSummary {
  id: string;
  version: number;
  status: CaseStatus;
  title: string;
  internalTitle: string;
  specialty: string;
  difficulty: string;
  source: string;
  license: string;
  synthetic: boolean;
  trainingUseAllowed: boolean;
  reviewStatus: string;
  updatedAt: string;
}

function toSummary(row: CaseRow): AdminCaseSummary {
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    title: row.title,
    internalTitle: row.data.internalTitle,
    specialty: row.specialty,
    difficulty: row.difficulty,
    source: row.source,
    license: row.license,
    synthetic: row.synthetic,
    trainingUseAllowed: row.trainingUseAllowed,
    reviewStatus: row.reviewStatus,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAllCases(): Promise<AdminCaseSummary[]> {
  const db = await getDb();
  const rows = await db.select().from(cases).orderBy(desc(cases.updatedAt));
  return rows.map(toSummary);
}

export async function getCaseAdmin(id: string): Promise<{ summary: AdminCaseSummary; data: PatientCase }> {
  const db = await getDb();
  const [row] = await db.select().from(cases).where(eq(cases.id, id));
  if (!row) throw Errors.notFound("Кейс");
  return { summary: toSummary(row), data: row.data };
}

function parseOrThrow(input: unknown): PatientCase {
  const result = validateCase(input);
  if (!result.ok) throw Errors.badRequest("Кейсийн бүтэц буруу байна.", result.issues);
  return result.case;
}

export async function createCase(input: unknown, userId: string | null, status: CaseStatus = "draft"): Promise<AdminCaseSummary> {
  const c = parseOrThrow(input);
  const db = await getDb();
  const [existing] = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, c.id));
  if (existing) throw Errors.conflict(`"${c.id}" кейс аль хэдийн байна.`);
  const [row] = await db
    .insert(cases)
    .values({ id: c.id, version: c.version, status, createdBy: userId, ...rowValues(c) })
    .returning();
  return toSummary(row);
}

/** Replace a case's content. The version is bumped so sessions keep their snapshot. */
export async function updateCase(id: string, input: unknown): Promise<AdminCaseSummary> {
  const db = await getDb();
  const [current] = await db.select().from(cases).where(eq(cases.id, id));
  if (!current) throw Errors.notFound("Кейс");
  const parsed = parseOrThrow(input);
  if (parsed.id !== id) throw Errors.badRequest("Кейсийн id-г өөрчлөх боломжгүй.");
  const c: PatientCase = { ...parsed, version: current.version + 1 };
  const [row] = await db
    .update(cases)
    .set({ version: c.version, updatedAt: new Date(), ...rowValues(c) })
    .where(eq(cases.id, id))
    .returning();
  return toSummary(row);
}

export async function setCaseStatus(id: string, status: CaseStatus): Promise<AdminCaseSummary> {
  const db = await getDb();
  const [row] = await db.update(cases).set({ status, updatedAt: new Date() }).where(eq(cases.id, id)).returning();
  if (!row) throw Errors.notFound("Кейс");
  return toSummary(row);
}

export interface ImportReport {
  created: string[];
  updated: string[];
  failed: { index: number; id?: string; issues: { path: string; message: string }[] }[];
}

/**
 * Import one case or an array of cases. Each item is validated separately so
 * one bad case does not block the others; existing ids are updated.
 */
export async function importCases(payload: unknown, userId: string | null): Promise<ImportReport> {
  const items = Array.isArray(payload) ? payload : [payload];
  if (items.length === 0) throw Errors.badRequest("Импортлох кейс алга.");
  if (items.length > 200) throw Errors.badRequest("Нэг удаад 200-аас олон кейс импортлох боломжгүй.");
  const report: ImportReport = { created: [], updated: [], failed: [] };
  const db = await getDb();
  for (const [index, item] of items.entries()) {
    const result = validateCase(item);
    if (!result.ok) {
      const id = typeof item === "object" && item && "id" in item ? String((item as { id: unknown }).id) : undefined;
      report.failed.push({ index, id, issues: result.issues });
      continue;
    }
    const [existing] = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, result.case.id));
    if (existing) {
      await updateCase(result.case.id, result.case);
      report.updated.push(result.case.id);
    } else {
      await createCase(result.case, userId, "draft");
      report.created.push(result.case.id);
    }
  }
  return report;
}

export async function exportCases(status?: CaseStatus): Promise<PatientCase[]> {
  const db = await getDb();
  const rows = status ? await db.select().from(cases).where(eq(cases.status, status)) : await db.select().from(cases);
  return rows.map((r) => r.data);
}

/** Insert bundled demo cases that are not in the database yet (published). */
export async function seedDemoCases(): Promise<string[]> {
  const db = await getDb();
  const inserted: string[] = [];
  for (const c of loadDemoCases()) {
    const [existing] = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, c.id));
    if (existing) continue;
    await db.insert(cases).values({ id: c.id, version: c.version, status: "published", ...rowValues(c) });
    inserted.push(c.id);
  }
  return inserted;
}
