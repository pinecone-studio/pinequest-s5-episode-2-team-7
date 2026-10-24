import { NextResponse } from "next/server";
import { route } from "@/lib/api/http";
import { getPublishedNews } from "@/lib/services/news";

type Ctx = { params: Promise<{ id: string }> };

/** One published article. Public, like the list. */
export const GET = route<Ctx>(async (_request, { params }) => {
  const { id } = await params;
  return NextResponse.json({ article: await getPublishedNews(id) });
});
