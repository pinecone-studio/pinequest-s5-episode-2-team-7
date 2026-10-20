import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { messages, modelRegistry } from "@/lib/db/schema";
import { getPatientProvider } from "@/lib/patient/providers";
import type { ProviderHealth } from "@/lib/patient/providers/types";

export interface ProviderDiagnostics {
  configured: { provider: string; fallback: string; intentClassifier: string; feedbackNarrative: string; database: "postgres" | "pglite" };
  health: ProviderHealth | { ok: false; detail: string };
  /** Last 24h of patient answers grouped by the provider that actually answered. */
  recentAnswers: { provider: string | null; model: string | null; fallback: boolean; count: number }[];
  registeredModels: { provider: string; model: string; adapterId: string | null; baseModel: string | null; createdAt: string }[];
}

export async function providerDiagnostics(): Promise<ProviderDiagnostics> {
  const config = getConfig();
  let health: ProviderDiagnostics["health"];
  try {
    health = await getPatientProvider().health();
  } catch (error) {
    health = { ok: false, detail: error instanceof Error ? error.message : "unknown error" };
  }
  const db = await getDb();
  const recent = await db
    .select({ provider: messages.provider, model: messages.model, fallback: messages.fallbackUsed, count: sql<number>`count(*)::int` })
    .from(messages)
    .where(sql`${messages.role} = 'patient' and ${messages.createdAt} > now() - interval '24 hours' and ${messages.seq} > 0`)
    .groupBy(messages.provider, messages.model, messages.fallbackUsed);
  const registered = await db.select().from(modelRegistry).where(eq(modelRegistry.provider, "finetuned")).orderBy(desc(modelRegistry.createdAt)).limit(10);
  return {
    configured: {
      provider: config.PATIENT_PROVIDER,
      fallback: config.PATIENT_FALLBACK_PROVIDER,
      intentClassifier: config.INTENT_CLASSIFIER,
      feedbackNarrative: config.FEEDBACK_NARRATIVE,
      database: config.DATABASE_URL ? "postgres" : "pglite",
    },
    health,
    recentAnswers: recent,
    registeredModels: registered.map((r) => ({ provider: r.provider, model: r.model, adapterId: r.adapterId, baseModel: r.baseModel, createdAt: r.createdAt.toISOString() })),
  };
}
