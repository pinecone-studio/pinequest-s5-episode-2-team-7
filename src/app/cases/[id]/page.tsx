import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScenarioPlay } from "@/components/practice/scenario-play";
import { findScenario } from "@/lib/practice/scenarios";
import { ROLES } from "@/lib/role";
import { getRole } from "@/lib/role-server";

export async function generateMetadata({ params }: PageProps<"/cases/[id]">): Promise<Metadata> {
  return { title: findScenario((await params).id)?.title ?? "Яаралтай тохиолдол" };
}

/** Plays one emergency case; works without signing in and without the server's AI. */
export default async function CasePage({ params }: PageProps<"/cases/[id]">) {
  const scenario = findScenario((await params).id);
  if (!scenario) notFound();
  const role = await getRole();
  return <ScenarioPlay scenario={scenario} roleTitle={role ? ROLES[role].title : "Эмнэлгийн ажилтан"} />;
}
