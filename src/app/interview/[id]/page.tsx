import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { InterviewWorkspace } from "@/components/interview/workspace";
import { ApiError } from "@/lib/api/http";
import { requirePageUser } from "@/lib/auth/server";
import { getSessionView } from "@/lib/services/sessions";

export const metadata: Metadata = { title: "Ярилцлага" };

export default async function InterviewPage({ params }: PageProps<"/interview/[id]">) {
  const { id } = await params;
  const auth = await requirePageUser(`/interview/${id}`);
  let view;
  try {
    view = await getSessionView(auth, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  if (view.status !== "active") redirect(`/sessions/${id}`);
  return <InterviewWorkspace initial={view} />;
}
