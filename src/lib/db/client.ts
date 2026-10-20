import "server-only";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getConfig } from "@/lib/config";
import * as schema from "./schema";

/**
 * Database access.
 * - DATABASE_URL set → PostgreSQL (Neon in production) via node-postgres.
 * - otherwise → embedded PGlite (real Postgres compiled to WASM) stored in
 *   PGLITE_DATA_DIR, migrated automatically. Development/tests only.
 *
 * Both drivers expose the same Drizzle query API; the PGlite type is used as
 * the common type.
 */
export type Db = PgliteDatabase<typeof schema>;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

interface DbHolder {
  promise?: Promise<Db>;
}
const globalHolder = globalThis as unknown as { __pqDb?: DbHolder };
const holder: DbHolder = (globalHolder.__pqDb ??= {});

export async function createPgliteDb(dataDir: string | "memory"): Promise<Db> {
  if (dataDir !== "memory" && !existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const client = dataDir === "memory" ? new PGlite() : new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

export function createPostgresDb(connectionString: string): Db {
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 20_000 });
  return drizzlePg(pool, { schema }) as unknown as Db;
}

export function getDb(): Promise<Db> {
  if (!holder.promise) {
    const config = getConfig();
    if (config.DATABASE_URL) {
      holder.promise = Promise.resolve(createPostgresDb(config.DATABASE_URL));
    } else {
      if (config.NODE_ENV === "production" && process.env.VERCEL) {
        throw new Error("DATABASE_URL is required in production deployments.");
      }
      holder.promise = createPgliteDb(config.NODE_ENV === "test" ? "memory" : config.PGLITE_DATA_DIR);
    }
    holder.promise.catch(() => {
      holder.promise = undefined;
    });
  }
  return holder.promise;
}

/** Tests: use a specific database instance. */
export function setDbForTests(db: Db | undefined) {
  holder.promise = db ? Promise.resolve(db) : undefined;
}
