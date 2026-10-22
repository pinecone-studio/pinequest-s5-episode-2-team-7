import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/api/http";
import { getPublishedNews } from "@/lib/services/news";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  await requireUser(request);
  const { id } = await params;
  return NextResponse.json({ article: await getPublishedNews(id) });
});
