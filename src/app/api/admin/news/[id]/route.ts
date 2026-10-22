import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireAdmin, route } from "@/lib/api/http";
import { deleteNews, getNewsAdmin, setNewsStatus, updateNews } from "@/lib/services/news";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  await requireAdmin(request);
  const { id } = await params;
  return NextResponse.json({ article: await getNewsAdmin(id) });
});

export const PUT = route<Ctx>(async (request, { params }) => {
  await requireAdmin(request);
  const { id } = await params;
  const body = await request.json().catch(() => null);
  return NextResponse.json({ article: await updateNews(id, body) });
});

export const PATCH = route<Ctx>(async (request, { params }) => {
  await requireAdmin(request);
  const { id } = await params;
  const { status } = await parseJson(request, z.object({ status: z.enum(["draft", "published", "archived"]) }));
  return NextResponse.json({ article: await setNewsStatus(id, status) });
});

export const DELETE = route<Ctx>(async (request, { params }) => {
  await requireAdmin(request);
  const { id } = await params;
  await deleteNews(id);
  return NextResponse.json({ ok: true });
});
