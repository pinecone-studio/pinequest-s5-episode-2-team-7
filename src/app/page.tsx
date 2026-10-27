import { BarChart3, ChevronRight, ClipboardList, Flame, Newspaper, Sparkles, Trophy, UserRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Orb } from "@/components/orb";
import { RoleIcon } from "@/components/role-icon";
import { buttonClass } from "@/components/ui";
import { getPageSession } from "@/lib/auth/server";
import { coachHref } from "@/lib/coach/labels";
import { ROLES } from "@/lib/role";
import { getRole } from "@/lib/role-server";
import { myResults, teamsOverview } from "@/lib/services/coach";

export default async function HomePage() {
  const session = await getPageSession().catch(() => null);
  if (!session) return <Welcome />;
  const role = await getRole();
  if (!role) redirect("/role?next=/");

  const [results, overview] = await Promise.all([
    myResults(session.userId).catch(() => []),
    teamsOverview(session.userId).catch(() => ({ teams: [] })),
  ]);
  const average = results.length ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length) : null;
  const next = overview.teams
    .filter((t) => t.role !== "owner")
    .flatMap((t) => t.challenges.map((c) => ({ ...c, teamName: t.name })))
    .find((c) => !c.passed);
  const weakSpots = [...new Set(results.slice(0, 5).flatMap((r) => r.improvements))].slice(0, 3);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-5 py-6">
      <div className="flex items-center gap-3">
        <Link href="/role?next=/" className="flex items-center gap-2.5" aria-label={`Үүрэг: ${ROLES[role].title}. Солих`}>
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent-gradient text-white ring-[2.5px] ring-white">
            <RoleIcon role={role} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-ink">{ROLES[role].title}</span>
            <span className="block text-xs text-muted">Үүрэг солих</span>
          </span>
        </Link>
        <span className="flex-1" />
        <StreakBadge dates={results.map((r) => r.createdAt)} />
      </div>

      <div className="flex flex-col items-center text-center">
        <Orb size={120} className="mb-3" />
        <h1 className="font-display text-3xl font-semibold text-ink">Сайн байна уу{session.name ? `, ${session.name}` : ""}!</h1>
        <p className="mt-2 max-w-md text-sm text-ink/90">{ROLES[role].greeting}</p>
      </div>

      {/* Ask bar: the topic goes to «Сорил». */}
      <form action="/soril" className="glow-edge flex items-center gap-2 rounded-full p-1.5 [--glow-fill:#16121f]">
        <Sparkles size={18} className="ml-3 shrink-0 text-accent" aria-hidden />
        <label htmlFor="ask" className="sr-only">
          Юуг шалгуулах вэ?
        </label>
        <input id="ask" name="topic" required placeholder="Юуг шалгуулах вэ? Сэдвээ бичээрэй…" className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink placeholder:text-subtle focus:outline-none" />
        <button type="submit" className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-accent-gradient text-white" aria-label="Сорил бэлдэх">
          ↑
        </button>
      </form>

      {next && (
        <Link
          href={coachHref(next.packRef, next.mode, next.difficulty, next.id)}
          className="flex items-center gap-4 rounded-3xl bg-[#271c22] p-4 ring-1 ring-gold/40"
        >
          <Trophy size={26} className="shrink-0 text-gold" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gold">{next.teamName} · сорилт</span>
            <span className="block truncate font-semibold text-ink">{next.title}</span>
            <span className="block text-xs text-muted">
              Зорилт {next.targetScore}
              {next.myBest !== null && ` · Таны шилдэг ${next.myBest}`}
            </span>
          </span>
          <ChevronRight className="text-subtle" aria-hidden />
        </Link>
      )}

      <Link href="/coach" className="glass flex items-center gap-4 rounded-3xl p-4">
        <Orb size={56} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">AI дасгалжуулагч</span>
          <span className="block text-sm text-muted">Үйлчлүүлэгч, өвчтөн, сурагч, дуудлага өгөгч болж видео эсвэл утсаар ярина</span>
        </span>
        <ChevronRight className="shrink-0 text-subtle" aria-hidden />
      </Link>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Таны явц</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <Stat value={average ?? "–"} label="Дундаж оноо" />
          <Stat value={results.length} label="Ярилцлага" />
          <Stat value={overview.teams.length} label="Баг" />
        </div>
      </section>

      {weakSpots.length > 0 && (
        <section className="rounded-3xl bg-[#271c22]/90 p-4">
          <h2 className="mb-2 font-semibold text-warn">Анхаарах зүйлс</h2>
          <ul className="space-y-1 text-sm text-ink">
            {weakSpots.map((w) => (
              <li key={w}>• {w}</li>
            ))}
          </ul>
          <Link href="/feedback" className="mt-3 inline-block text-sm font-semibold text-accent-deep">
            Бүх дүгнэлт →
          </Link>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Shortcut href="/soril" icon={<ClipboardList size={20} aria-hidden />} title="Сорил" detail="Материалаасаа тест, аман шалгалт" />
        <Shortcut href="/news" icon={<Newspaper size={20} aria-hidden />} title="Мэдээ" detail="Салбарын шинэ мэдээ" />
      </div>
    </main>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-[20px] bg-field px-2 py-3.5 text-center ring-1 ring-line">
      <div className="text-2xl font-semibold tabular-nums text-ink">{value}</div>
      <div className="truncate text-[11px] text-muted">{label}</div>
    </div>
  );
}

function Shortcut({ href, icon, title, detail }: { href: string; icon: React.ReactNode; title: string; detail: string }) {
  return (
    <Link href={href} className="glass flex flex-col gap-2 rounded-3xl p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-deep">{icon}</span>
      <span className="font-semibold text-ink">{title}</span>
      <span className="text-xs text-muted">{detail}</span>
    </Link>
  );
}

/** Days in a row (ending today or yesterday) with at least one practice. */
function StreakBadge({ dates }: { dates: string[] }) {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const days = new Set(dates.map((d) => day(new Date(d))));
  const cursor = new Date();
  if (!days.has(day(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (days.has(day(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  if (streak === 0) return null;
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/55" aria-label={`${streak} өдөр дараалан дадлага хийсэн`}>
      <Flame size={16} aria-hidden /> {streak} өдөр
    </span>
  );
}

/** Signed out: onboarding step 1, «what it is» (as in the iOS app). */
function Welcome() {
  const features = [
    { icon: <UserRound size={20} aria-hidden />, title: "AI дасгалжуулагч", detail: "Үйлчлүүлэгч, өвчтөн, сурагч, дуудлага өгөгч болж видео эсвэл утсаар ярина" },
    { icon: <ClipboardList size={20} aria-hidden />, title: "Сорил", detail: "Материалаа зураг, PDF-ээр оруулаад тест, бодлого, аман шалгалт өг" },
    { icon: <BarChart3 size={20} aria-hidden />, title: "Дүгнэлт", detail: "Хийсэн бүхэнд тань оноо, «ингэж хэлбэл илүү» санал" },
  ];
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-6 py-10 text-center">
      <Orb size={190} />
      <h1 className="mt-6 font-display text-4xl font-bold text-ink">OTech AI</h1>
      <p className="mt-3 text-lg font-medium text-muted">
        Жинхэнэ хүн дээр алдахаас өмнө
        <br />
        AI дээр дадлагажуул.
      </p>
      <ul className="mt-8 w-full space-y-3 text-left">
        {features.map((f) => (
          <li key={f.title} className="glass flex items-start gap-3.5 rounded-[20px] p-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-accent-soft text-accent-deep">{f.icon}</span>
            <span>
              <span className="block font-semibold text-ink">{f.title}</span>
              <span className="block text-xs text-muted">{f.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link href="/role?next=/register" className={buttonClass("primary", "lg", "mt-8 w-full")}>
        Эхлэх
      </Link>
      <Link href="/login" className="mt-4 text-sm text-muted hover:text-ink">
        Бүртгэлтэй юу? <span className="font-semibold text-accent-deep">Нэвтрэх</span>
      </Link>
    </main>
  );
}
