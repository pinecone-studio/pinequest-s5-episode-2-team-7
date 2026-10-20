import { NextResponse } from "next/server";
import { parseJson, requireUser, route } from "@/lib/api/http";
import { askQuestion, getSessionView, QuestionInput } from "@/lib/services/sessions";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id } = await params;
  const session = await getSessionView(auth, id);
  return NextResponse.json({ messages: session.messages });
});

export const POST = route<Ctx>(async (request, { params }) => {
  const auth = await requireUser(request);
  const { id } = await params;
  const { content } = await parseJson(request, QuestionInput);
  return NextResponse.json(await askQuestion(auth, id, content), { status: 201 });
});
