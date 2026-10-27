import type { Metadata } from "next";
import { TeamView } from "@/components/team/team-view";
import { requirePageUser } from "@/lib/auth/server";
import { listPacks, teamsOverview } from "@/lib/services/coach";

export const metadata: Metadata = { title: "Баг" };

export default async function TeamPage() {
  const session = await requirePageUser("/team");
  const [overview, packs] = await Promise.all([teamsOverview(session.userId), listPacks(session.userId)]);
  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-5 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-white">Баг</h1>
        <p className="mt-1.5 text-sm text-white/90">Ажил олгогч сорилт өгч, ажилтан биелүүлнэ. Үр дүн бүр менежерт шууд мэдэгдэнэ.</p>
      </div>
      <TeamView teams={overview.teams} packs={[...packs.custom, ...packs.builtin]} />
    </main>
  );
}
