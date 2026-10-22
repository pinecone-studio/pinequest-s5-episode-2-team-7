import { NextResponse } from "next/server";
import { requireAdmin, route } from "@/lib/api/http";
import { createNews, listAllNews } from "@/lib/services/news";

export const GET = route(async (request) => {
  await requireAdmin(request);
  return NextResponse.json({ news: await listAllNews() });
});

/** New articles start as drafts; publish with PATCH. */
export const POST = route(async (request) => {
  const auth = await requireAdmin(request);
  const body = await request.json().catch(() => null);
  return NextResponse.json({ article: await createNews(body, auth.userId) }, { status: 201 });
});
