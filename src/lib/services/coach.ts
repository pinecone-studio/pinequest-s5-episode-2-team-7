import "server-only";
import { randomInt } from "node:crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { Errors } from "@/lib/api/http";
import { BUILTIN_PACKS, builtinPack } from "@/lib/coach/packs";
import { publicPack, type CoachDebrief, type CoachLine, type CoachPack, type PublicPack } from "@/lib/coach/types";
import { getDb } from "@/lib/db/client";
import { challenges, coachPacks, coachResults, teamMembers, teams, users } from "@/lib/db/schema";

/**
 * AI дасгалжуулагч data: packs made from company material, teams (an employer
 * and their staff), challenges and results.
 *
 * Access rules:
 * - a custom pack is visible to its owner, and to members of the team it was shared with;
 * - a team's owner sees every challenge result of the team; a member sees only their own;
 * - free practice (no challenge) stays private to the person who practised.
 */

const UUID = z.string().uuid();

async function teamIdsOf(userId: string): Promise<{ teamId: string; role: "owner" | "member" }[]> {
  const db = await getDb();
  return db.select({ teamId: teamMembers.teamId, role: teamMembers.role }).from(teamMembers).where(eq(teamMembers.userId, userId));
}

async function requireOwner(userId: string, teamId: string) {
  const db = await getDb();
  const [row] = await db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  if (!row) throw Errors.notFound("Баг");
  if (row.role !== "owner") throw Errors.forbidden();
}

// --- Packs ------------------------------------------------------------------

/** A built-in pack id or a custom pack the user may use. */
export async function resolvePack(userId: string, ref: string): Promise<{ pack: CoachPack; teamId: string | null }> {
  const builtin = builtinPack(ref);
  if (builtin) return { pack: builtin, teamId: null };
  if (!UUID.safeParse(ref).success) throw Errors.notFound("Дадлагын дүр");
  const db = await getDb();
  const [row] = await db.select().from(coachPacks).where(eq(coachPacks.id, ref));
  if (!row) throw Errors.notFound("Дадлагын дүр");
  if (row.ownerId !== userId) {
    const memberships = await teamIdsOf(userId);
    if (!row.teamId || !memberships.some((m) => m.teamId === row.teamId)) throw Errors.notFound("Дадлагын дүр");
  }
  return { pack: { ...row.data, id: row.id }, teamId: row.teamId };
}

export async function listPacks(userId: string): Promise<{ builtin: PublicPack[]; custom: PublicPack[] }> {
  const db = await getDb();
  const teamIds = (await teamIdsOf(userId)).map((m) => m.teamId);
  const rows = await db
    .select()
    .from(coachPacks)
    .where(teamIds.length ? or(eq(coachPacks.ownerId, userId), inArray(coachPacks.teamId, teamIds)) : eq(coachPacks.ownerId, userId))
    .orderBy(desc(coachPacks.createdAt))
    .limit(50);
  return {
    builtin: BUILTIN_PACKS.map((p) => publicPack(p)),
    custom: rows.map((r) => publicPack({ ...r.data, id: r.id }, r.teamId)),
  };
}

export async function savePack(userId: string, pack: CoachPack, teamId: string | null): Promise<PublicPack> {
  if (teamId) await requireOwner(userId, teamId);
  const db = await getDb();
  const [row] = await db.insert(coachPacks).values({ ownerId: userId, teamId, title: pack.title, data: pack }).returning();
  const saved = { ...pack, id: row.id };
  await db.update(coachPacks).set({ data: saved }).where(eq(coachPacks.id, row.id));
  return publicPack(saved, teamId);
}

// --- Teams --------------------------------------------------------------------

// No 0/O, 1/I/L: the code is read out loud and typed on a phone.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

export const CreateTeamSchema = z.object({ name: z.string().trim().min(2).max(80) });
export const JoinTeamSchema = z.object({ code: z.string().trim().toUpperCase().min(4).max(12) });

export async function createTeam(userId: string, name: string) {
  const db = await getDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const [taken] = await db.select({ id: teams.id }).from(teams).where(eq(teams.code, code));
    if (taken) continue;
    const [team] = await db.insert(teams).values({ name, code, ownerId: userId }).returning();
    await db.insert(teamMembers).values({ teamId: team.id, userId, role: "owner" });
    return { id: team.id, name: team.name, code: team.code };
  }
  throw Errors.conflict("Код үүсгэж чадсангүй. Дахин оролдоно уу.");
}

export async function joinTeam(userId: string, code: string) {
  const db = await getDb();
  const [team] = await db.select().from(teams).where(eq(teams.code, code));
  if (!team) throw Errors.notFound("Ийм кодтой баг");
  await db.insert(teamMembers).values({ teamId: team.id, userId, role: "member" }).onConflictDoNothing();
  return { id: team.id, name: team.name };
}

export const CreateChallengeSchema = z.object({
  packRef: z.string().min(1).max(64),
  title: z.string().trim().max(120).default(""),
  mode: z.enum(["video", "audio"]).default("audio"),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  targetScore: z.number().int().min(10).max(100).default(70),
  dueDays: z.number().int().min(1).max(60).nullable().default(null),
  /** Minutes for one attempt (overrides the persona's own limit). */
  timeLimitMin: z.number().int().min(1).max(30).nullable().default(null),
  /** Attempts each assignee gets; null = unlimited. */
  maxAttempts: z.number().int().min(1).max(10).nullable().default(null),
  /** Only these members; null = everyone in the team (also those who join later). */
  assignees: z.array(z.string().uuid()).max(500).nullable().default(null),
});

const assigned = (c: { assignees: string[] | null }, userId: string) => !c.assignees || c.assignees.includes(userId);

export async function createChallenge(userId: string, teamId: string, input: z.infer<typeof CreateChallengeSchema>) {
  await requireOwner(userId, teamId);
  const { pack, teamId: packTeam } = await resolvePack(userId, input.packRef);
  if (pack.kind === "custom" && packTeam !== teamId) {
    // A private pack used for a challenge becomes visible to the team.
    const db = await getDb();
    await db.update(coachPacks).set({ teamId }).where(and(eq(coachPacks.id, pack.id), eq(coachPacks.ownerId, userId)));
  }
  const db = await getDb();
  let assignees: string[] | null = null;
  if (input.assignees) {
    const members = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
    const ids = new Set(members.map((m) => m.userId));
    assignees = [...new Set(input.assignees)].filter((id) => ids.has(id));
    if (assignees.length === 0) throw Errors.badRequest("Сорилт өгөх ажилтнаа сонгоно уу.");
  }
  const [row] = await db
    .insert(challenges)
    .values({
      teamId,
      packRef: input.packRef,
      title: input.title || pack.title,
      mode: input.mode,
      difficulty: input.difficulty,
      targetScore: input.targetScore,
      dueAt: input.dueDays ? new Date(Date.now() + input.dueDays * 86_400_000) : null,
      timeLimitSec: input.timeLimitMin ? input.timeLimitMin * 60 : null,
      maxAttempts: input.maxAttempts,
      assignees,
      createdBy: userId,
    })
    .returning();
  return row;
}

/**
 * What a member may still do in a challenge: its time limit and attempts left.
 * Throws when the challenge is not theirs or no attempts are left.
 */
export async function challengeAccess(userId: string, challengeId: string) {
  if (!UUID.safeParse(challengeId).success) throw Errors.notFound("Сорилт");
  const db = await getDb();
  const [challenge] = await db.select().from(challenges).where(eq(challenges.id, challengeId));
  const membership = challenge ? (await teamIdsOf(userId)).find((m) => m.teamId === challenge.teamId) : undefined;
  if (!challenge || !membership) throw Errors.notFound("Сорилт");
  if (membership.role !== "owner" && !assigned(challenge, userId)) throw Errors.notFound("Сорилт");
  let attemptsLeft: number | null = null;
  if (challenge.maxAttempts && membership.role !== "owner") {
    const done = await db
      .select({ id: coachResults.id })
      .from(coachResults)
      .where(and(eq(coachResults.challengeId, challenge.id), eq(coachResults.userId, userId)));
    attemptsLeft = Math.max(0, challenge.maxAttempts - done.length);
  }
  return { challenge, owner: membership.role === "owner", attemptsLeft };
}

/** Everything the «Баг» screen needs, from the point of view of `userId`. */
export async function teamsOverview(userId: string) {
  const db = await getDb();
  const memberships = await teamIdsOf(userId);
  if (memberships.length === 0) return { teams: [] };
  const ids = memberships.map((m) => m.teamId);
  const [teamRows, memberRows, challengeRows, resultRows] = await Promise.all([
    db.select().from(teams).where(inArray(teams.id, ids)),
    db
      .select({ teamId: teamMembers.teamId, userId: teamMembers.userId, role: teamMembers.role, joinedAt: teamMembers.joinedAt, name: users.name })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(inArray(teamMembers.teamId, ids)),
    db.select().from(challenges).where(inArray(challenges.teamId, ids)).orderBy(desc(challenges.createdAt)),
    db
      .select({
        id: coachResults.id,
        teamId: coachResults.teamId,
        challengeId: coachResults.challengeId,
        userId: coachResults.userId,
        name: users.name,
        packTitle: coachResults.packTitle,
        score: coachResults.score,
        createdAt: coachResults.createdAt,
      })
      .from(coachResults)
      .innerJoin(users, eq(users.id, coachResults.userId))
      .where(inArray(coachResults.teamId, ids))
      .orderBy(desc(coachResults.createdAt))
      .limit(300),
  ]);

  return {
    teams: teamRows.map((team) => {
      const role = memberships.find((m) => m.teamId === team.id)!.role;
      const owner = role === "owner";
      const results = resultRows.filter((r) => r.teamId === team.id && (owner || r.userId === userId));
      const members = memberRows
        .filter((m) => m.teamId === team.id)
        .map((m) => {
          const mine = results.filter((r) => r.userId === m.userId);
          return {
            userId: m.userId,
            name: m.name,
            role: m.role,
            practices: mine.length,
            best: mine.length ? Math.max(...mine.map((r) => r.score)) : null,
            last: mine[0]?.score ?? null,
          };
        });
      const staff = members.filter((m) => m.role !== "owner");
      const teamChallenges = challengeRows
        .filter((c) => c.teamId === team.id && (owner || assigned(c, userId)))
        .map((c) => {
          const attempts = results.filter((r) => r.challengeId === c.id);
          const mine = attempts.filter((r) => r.userId === userId);
          const myBest = mine.reduce<number | null>((b, r) => (b === null || r.score > b ? r.score : b), null);
          const passedBy = new Set(attempts.filter((r) => r.score >= c.targetScore).map((r) => r.userId));
          const targets = staff.filter((m) => assigned(c, m.userId));
          return {
            id: c.id,
            title: c.title,
            packRef: c.packRef,
            mode: c.mode,
            difficulty: c.difficulty,
            targetScore: c.targetScore,
            dueAt: c.dueAt?.toISOString() ?? null,
            createdAt: c.createdAt.toISOString(),
            myBest,
            passed: myBest !== null && myBest >= c.targetScore,
            passedCount: passedBy.size,
            attemptCount: attempts.length,
            timeLimitSec: c.timeLimitSec,
            maxAttempts: c.maxAttempts,
            attemptsLeft: c.maxAttempts ? Math.max(0, c.maxAttempts - mine.length) : null,
            assignedCount: targets.length,
            everyone: !c.assignees,
            // Owner only: where each assignee stands.
            progress: owner
              ? targets.map((m) => {
                  const theirs = attempts.filter((r) => r.userId === m.userId);
                  const best = theirs.reduce<number | null>((b, r) => (b === null || r.score > b ? r.score : b), null);
                  return {
                    userId: m.userId,
                    name: m.name,
                    attempts: theirs.length,
                    best,
                    passed: best !== null && best >= c.targetScore,
                    lastResultId: theirs[0]?.id ?? null,
                  };
                })
              : [],
          };
        });
      return {
        id: team.id,
        name: team.name,
        role,
        code: owner ? team.code : null,
        memberCount: members.length,
        members: owner ? members : members.filter((m) => m.userId === userId || m.role === "owner"),
        challenges: teamChallenges,
        feed: results.slice(0, 40).map((r) => {
          const challenge = challengeRows.find((c) => c.id === r.challengeId);
          return {
            id: r.id,
            name: r.name,
            packTitle: r.packTitle,
            score: r.score,
            targetScore: challenge?.targetScore ?? null,
            passed: challenge ? r.score >= challenge.targetScore : null,
            createdAt: r.createdAt.toISOString(),
          };
        }),
      };
    }),
  };
}

// --- Results --------------------------------------------------------------------

export async function saveResult(
  userId: string,
  input: {
    pack: CoachPack;
    mode: string;
    difficulty: string;
    debrief: CoachDebrief;
    transcript: CoachLine[];
    durationSec: number;
    challengeId: string | null;
  },
) {
  const db = await getDb();
  let teamId: string | null = null;
  let challenge: typeof challenges.$inferSelect | undefined;
  if (input.challengeId) {
    const access = await challengeAccess(userId, input.challengeId);
    if (access.attemptsLeft === 0) throw Errors.conflict("Энэ сорилтын оролдлого дууссан байна.");
    challenge = access.challenge;
    teamId = challenge.teamId;
  }
  const [row] = await db
    .insert(coachResults)
    .values({
      userId,
      teamId,
      challengeId: challenge?.id ?? null,
      packRef: input.pack.id,
      packTitle: input.pack.title,
      mode: input.mode,
      difficulty: input.difficulty,
      score: input.debrief.score,
      durationSec: input.durationSec,
      debrief: input.debrief,
      transcript: input.transcript,
    })
    .returning({ id: coachResults.id });
  return {
    id: row.id,
    challenge: challenge ? { id: challenge.id, title: challenge.title, targetScore: challenge.targetScore, passed: input.debrief.score >= challenge.targetScore } : null,
  };
}

export async function myResults(userId: string, limit = 50) {
  const db = await getDb();
  const rows = await db
    .select({
      id: coachResults.id,
      packRef: coachResults.packRef,
      packTitle: coachResults.packTitle,
      mode: coachResults.mode,
      score: coachResults.score,
      durationSec: coachResults.durationSec,
      challengeId: coachResults.challengeId,
      summary: coachResults.debrief,
      createdAt: coachResults.createdAt,
    })
    .from(coachResults)
    .where(eq(coachResults.userId, userId))
    .orderBy(desc(coachResults.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    packRef: r.packRef,
    packTitle: r.packTitle,
    mode: r.mode,
    score: r.score,
    durationSec: r.durationSec,
    challengeId: r.challengeId,
    summary: r.summary.summary,
    improvements: r.summary.improvements.slice(0, 3),
    createdAt: r.createdAt.toISOString(),
  }));
}

/** One result in full: its owner, or the owner of the team it belongs to. */
export async function resultDetail(userId: string, id: string) {
  if (!UUID.safeParse(id).success) throw Errors.notFound("Дүгнэлт");
  const db = await getDb();
  const [row] = await db
    .select({ result: coachResults, name: users.name })
    .from(coachResults)
    .innerJoin(users, eq(users.id, coachResults.userId))
    .where(eq(coachResults.id, id));
  if (!row) throw Errors.notFound("Дүгнэлт");
  const r = row.result;
  if (r.userId !== userId) {
    const owner = r.teamId ? (await teamIdsOf(userId)).some((m) => m.teamId === r.teamId && m.role === "owner") : false;
    if (!owner) throw Errors.notFound("Дүгнэлт");
  }
  return {
    id: r.id,
    name: row.name,
    packRef: r.packRef,
    packTitle: r.packTitle,
    mode: r.mode,
    difficulty: r.difficulty,
    score: r.score,
    durationSec: r.durationSec,
    debrief: r.debrief,
    transcript: r.transcript,
    createdAt: r.createdAt.toISOString(),
  };
}

// --- One member's progress (owner view) -------------------------------------------

/**
 * Everything a manager needs to coach one employee: scores over time, which
 * criteria keep failing, their challenges and every graded conversation.
 * Only team work counts: free practice stays private.
 */
export async function memberProgress(ownerId: string, teamId: string, memberId: string) {
  if (!UUID.safeParse(teamId).success || !UUID.safeParse(memberId).success) throw Errors.notFound("Ажилтан");
  await requireOwner(ownerId, teamId);
  const db = await getDb();
  const [member] = await db
    .select({ userId: teamMembers.userId, role: teamMembers.role, joinedAt: teamMembers.joinedAt, name: users.name })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, memberId)));
  if (!member) throw Errors.notFound("Ажилтан");

  const [rows, challengeRows] = await Promise.all([
    db
      .select()
      .from(coachResults)
      .where(and(eq(coachResults.teamId, teamId), eq(coachResults.userId, memberId)))
      .orderBy(desc(coachResults.createdAt))
      .limit(100),
    db.select().from(challenges).where(eq(challenges.teamId, teamId)).orderBy(desc(challenges.createdAt)),
  ]);

  const scores = rows.map((r) => r.score);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  // Trend: the latest 3 against the 3 before them (needs 4+ results).
  const trend = rows.length >= 4 ? (avg(scores.slice(0, 3)) ?? 0) - (avg(scores.slice(3, 6)) ?? 0) : null;

  // Criteria across all conversations: how often each one was met.
  const byLabel = new Map<string, { label: string; met: number; partial: number; missed: number }>();
  for (const r of rows) {
    for (const c of r.debrief.rubric) {
      const key = c.label.trim().toLowerCase();
      const entry = byLabel.get(key) ?? { label: c.label, met: 0, partial: 0, missed: 0 };
      if (c.result === "yes") entry.met++;
      else if (c.result === "partial") entry.partial++;
      else entry.missed++;
      byLabel.set(key, entry);
    }
  }
  const criteria = [...byLabel.values()]
    .map((c) => {
      const total = c.met + c.partial + c.missed;
      return { ...c, total, rate: Math.round(((c.met + c.partial / 2) / total) * 100) };
    })
    .sort((a, b) => a.rate - b.rate);

  const challengeStatus = challengeRows
    .filter((c) => !c.assignees || c.assignees.includes(memberId))
    .map((c) => {
      const theirs = rows.filter((r) => r.challengeId === c.id);
      const best = theirs.reduce<number | null>((b, r) => (b === null || r.score > b ? r.score : b), null);
      const passed = best !== null && best >= c.targetScore;
      return {
        id: c.id,
        title: c.title,
        targetScore: c.targetScore,
        attempts: theirs.length,
        best,
        passed,
        overdue: !passed && c.dueAt !== null && c.dueAt.getTime() < Date.now(),
        dueAt: c.dueAt?.toISOString() ?? null,
      };
    });

  return {
    member: { userId: member.userId, name: member.name, joinedAt: member.joinedAt.toISOString() },
    stats: {
      count: rows.length,
      average: avg(scores),
      best: scores.length ? Math.max(...scores) : null,
      last: scores[0] ?? null,
      trend,
      minutes: Math.round(rows.reduce((s, r) => s + r.durationSec, 0) / 60),
      lastActive: rows[0]?.createdAt.toISOString() ?? null,
      passed: challengeStatus.filter((c) => c.passed).length,
      pending: challengeStatus.filter((c) => !c.passed).length,
      overdue: challengeStatus.filter((c) => c.overdue).length,
    },
    criteria: criteria.slice(0, 12),
    // The latest coaching points (most recent conversation first, no repeats).
    focus: [...new Set(rows.slice(0, 5).flatMap((r) => r.debrief.improvements))].slice(0, 5),
    challenges: challengeStatus,
    results: rows.map((r) => {
      const c = challengeRows.find((x) => x.id === r.challengeId);
      return {
        id: r.id,
        packTitle: r.packTitle,
        score: r.score,
        durationSec: r.durationSec,
        challengeTitle: c?.title ?? null,
        passed: c ? r.score >= c.targetScore : null,
        summary: r.debrief.summary,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  };
}
