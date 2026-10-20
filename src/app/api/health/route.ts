import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { route } from "@/lib/api/http";
import { getDb } from "@/lib/db/client";

/** Liveness + database check. Does not expose configuration. */
export const GET = route(async () => {
  const db = await getDb();
  await db.execute(sql`select 1`);
  return NextResponse.json({ ok: true });
});
