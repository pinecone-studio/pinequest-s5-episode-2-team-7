import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { Errors, route } from "@/lib/api/http";
import { getConfig } from "@/lib/config";
import { importNewsFromFeeds } from "@/lib/services/news-import";

export const maxDuration = 120;

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>`; no secret configured = always refused. */
function isCronRequest(request: Request): boolean {
  const secret = getConfig().CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

/** Daily news import, called by Vercel Cron (see vercel.json) with CRON_SECRET. */
export const GET = route(async (request) => {
  if (!isCronRequest(request)) throw Errors.unauthorized();
  const result = await importNewsFromFeeds();
  console.info(`[news] cron import: ${result.created} created, ${result.skipped} skipped, ${result.failed} failed`);
  return NextResponse.json(result);
});
