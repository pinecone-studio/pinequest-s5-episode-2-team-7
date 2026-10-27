import { BarChart3, ClipboardList, Lightbulb, PlayCircle, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChallengeBanner, type NextChallenge } from "@/components/coach/coach-hub";
import { Header, HomeProgress, StreakBadge } from "@/components/home/home-progress";
import { Orb } from "@/components/orb";
import { FeaturedCase } from "@/components/practice/case-cards";
import { RoleIcon } from "@/components/role-icon";
import { buttonClass } from "@/components/ui";
import { getPageSession } from "@/lib/auth/server";
import { coachHref, modeLabel } from "@/lib/coach/labels";
import { builtinPack } from "@/lib/coach/packs";
import { NEWS_CATEGORY_LABELS } from "@/lib/i18n";
import { factOfTheDay } from "@/lib/practice/knowledge";
import { dailyScenario, isMedical } from "@/lib/practice/scenarios";
import { ROLES, type UserRole } from "@/lib/role";
import { getRole } from "@/lib/role-server";
import { myResults, teamsOverview } from "@/lib/services/coach";
import { listPublishedNews } from "@/lib/services/news";

/** The persona that fits the chosen role best (as `suggestedPack` in the iOS app). */
const SUGGESTED: Record<UserRole, string> = {
  health: "patient",
  dispatcher: "dispatch103",
  learner: "buyer",
  teacher: "student",
  service: "callcenter",
  manager: "reception",
};

/**
 * «Нүүр»: what to do today, not a second menu (as `HomeView` in the iOS app).
 * Signed out it is the welcome screen of the onboarding.
 */
export default async function HomePage() {
  const session = await getPageSession().catch(() => null);
  if (!session) return <Welcome />;
  const role = await getRole();
  if (!role) redirect("/role?next=/");
  const medical = isMedical(role);

  // A database hiccup should not take the home screen down: each part falls back to empty.
  const [results, overview, news] = await Promise.all([
    myResults(session.userId).catch(() => []),
    teamsOverview(session.userId).catch(() => ({ teams: [] })),
    listPublishedNews(1).catch(() => []),
  ]);
  const next: NextChallenge | null =
    overview.teams.filter((t) => t.role !== "owner").flatMap((t) => t.challenges.filter((c) => !c.passed).map((c) => ({ ...c, teamName: t.name })))[0] ?? null;
  const suggested = builtinPack(SUGGESTED[role]);
  const fact = factOfTheDay();
  const story = news[0];

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
        <StreakBadge coachDates={results.map((r) => r.createdAt)} />
      </div>

      <div className="flex flex-col items-center text-center">
        <Orb size={120} className="mb-3" />
        <h1 className="font-display text-3xl font-semibold text-ink">Сайн байна уу!</h1>
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

      {next && <ChallengeBanner item={next} />}

      {suggested && (
        <section className="space-y-3">
          <Header title="AI дасгалжуулагч" action={{ href: "/coach", label: "Бүгд" }} />
          <Link href={coachHref(suggested.id, suggested.defaultMode, "medium")} className="glass flex items-center gap-3.5 rounded-3xl p-3.5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-soft text-4xl">{suggested.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{suggested.title}</span>
              <span className="line-clamp-2 text-xs text-muted">{suggested.subtitle}</span>
              <span className="text-[11px] font-semibold text-accent">{modeLabel(suggested.defaultMode)}</span>
            </span>
            <PlayCircle size={34} className="shrink-0 text-accent" aria-label="Эхлэх" />
          </Link>
        </section>
      )}

      {medical && (
        <section className="space-y-3">
          <Header title="Өнөөдрийн даалгавар" action={{ href: "/cases", label: "Бүгд" }} />
          <FeaturedCase scenario={dailyScenario()} />
        </section>
      )}

      <HomeProgress coach={results.map(({ packTitle, score, improvements, createdAt }) => ({ packTitle, score, improvements, createdAt }))} medical={medical} />

      {medical && (
        <Link href={`/knowledge/${fact.article.id}`} className="block space-y-2.5 rounded-[26px] bg-[#271c22]/90 p-4 ring-1 ring-line">
          <span className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-warn">
              <Lightbulb size={16} aria-hidden /> Өдрийн мэдлэг
            </span>
            <span className="text-xs text-muted">{fact.article.title}</span>
          </span>
          <span className="block text-ink">{fact.fact}</span>
          <span className="block text-xs font-semibold text-accent-deep">Дэлгэрэнгүй →</span>
        </Link>
      )}

      {story && (
        <section className="space-y-3">
          <Header title="Онцлох мэдээ" action={{ href: "/news", label: "Бүгд" }} />
          <Link href={`/news/${story.id}`} className="glass block overflow-hidden rounded-3xl">
            {story.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={story.imageUrl} alt="" className="h-40 w-full object-cover" />
            )}
            <span className="block space-y-1 p-4">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-deep">{NEWS_CATEGORY_LABELS[story.category] ?? story.category}</span>
              <span className="block font-semibold text-ink">{story.title}</span>
              <span className="line-clamp-2 text-sm text-muted">{story.summary}</span>
            </span>
          </Link>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Shortcut href={medical ? "/knowledge" : "/soril"} icon={medical ? <Lightbulb size={20} aria-hidden /> : <ClipboardList size={20} aria-hidden />} title={medical ? "Мэдлэг" : "Сорил"} detail={medical ? "Анатоми, яаралтай тусламж" : "Материалаасаа тест, аман шалгалт"} />
        <Shortcut href="/feedback" icon={<BarChart3 size={20} aria-hidden />} title="Дүгнэлт" detail="Бүх оноо, санал нэг дор" />
      </div>
    </main>
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
