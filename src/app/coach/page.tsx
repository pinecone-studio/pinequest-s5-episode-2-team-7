import type { Metadata } from "next";
import { CoachHub, type NextChallenge } from "@/components/coach/coach-hub";
import { CoachSession } from "@/components/coach/coach-session";
import { NeedSignIn } from "@/components/coach/need-sign-in";
import { getPageSession } from "@/lib/auth/server";
import { listPacks, teamsOverview } from "@/lib/services/coach";
import { COACH_DIFFICULTIES, COACH_MODES, type CoachDifficulty, type CoachMode } from "@/lib/coach/types";

export const metadata: Metadata = { title: "AI дасгалжуулагч" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * /coach without `pack`: the persona hub (the orb tab of the iOS app).
 * /coach?pack=callcenter&mode=audio|video&difficulty=easy|medium|hard&challenge=<id>: the practice page, also opened by the Otech AI iOS app.
 */
export default async function CoachPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const pack = one(params.pack) ?? "";
  const session = await getPageSession();
  if (!session) {
    const query = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    return <NeedSignIn next={`/coach${query.size ? `?${query.toString()}` : ""}`} />;
  }
  if (!pack) {
    const [packs, overview] = await Promise.all([listPacks(session.userId), teamsOverview(session.userId)]);
    const next: NextChallenge | null =
      overview.teams
        .filter((t) => t.role !== "owner")
        .flatMap((t) => t.challenges.filter((c) => !c.passed).map((c) => ({ ...c, teamName: t.name })))[0] ?? null;
    const ownedTeams = overview.teams.filter((t) => t.role === "owner").map((t) => ({ id: t.id, name: t.name }));
    return <CoachHub builtin={packs.builtin} custom={packs.custom} ownedTeams={ownedTeams} next={next} />;
  }
  const mode = one(params.mode);
  const difficulty = one(params.difficulty);
  const challenge = one(params.challenge);
  return (
    <CoachSession
      packRef={pack}
      mode={COACH_MODES.includes(mode as CoachMode) ? (mode as CoachMode) : undefined}
      difficulty={COACH_DIFFICULTIES.includes(difficulty as CoachDifficulty) ? (difficulty as CoachDifficulty) : "medium"}
      challengeId={challenge && /^[0-9a-f-]{36}$/i.test(challenge) ? challenge : null}
    />
  );
}
