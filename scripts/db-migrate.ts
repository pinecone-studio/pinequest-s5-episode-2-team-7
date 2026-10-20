/**
 * Apply SQL migrations in ./drizzle.
 *   DATABASE_URL set   → migrates that PostgreSQL database (e.g. Neon)
 *   DATABASE_URL empty → migrates the local PGlite database (.data/pglite)
 */
import "./load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { createPgliteDb, MIGRATIONS_FOLDER } from "../src/lib/db/client";

async function main() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url, max: 1 });
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
    await pool.end();
    console.log("✓ PostgreSQL migrated");
  } else {
    await createPgliteDb(process.env.PGLITE_DATA_DIR || ".data/pglite");
    console.log("✓ Local PGlite database migrated (.data/pglite)");
  }
}

main().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
