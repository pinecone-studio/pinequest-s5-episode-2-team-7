import type { Metadata } from "next";
import { CoachSession } from "@/components/coach/coach-session";
import { NeedSignIn } from "@/components/coach/need-sign-in";
import { getPageSession } from "@/lib/auth/server";
import { COACH_DIFFICULTIES, COACH_MODES, type CoachDifficulty, type CoachMode } from "@/lib/coach/types";

export const metadata: Metadata = { title: "AI дасгалжуулагч" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** /coach?pack=callcenter&mode=audio|video&difficulty=easy|medium|hard&challenge=<id> — opened by the Otech AI iOS app. */
export default async function CoachPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const pack = one(params.pack) ?? "";
  if (!(await getPageSession())) {
    const query = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    return <NeedSignIn next={`/coach?${query.toString()}`} />;
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
