import { Award, LockKeyhole, MessagesSquare, Stethoscope } from "lucide-react";
import Link from "next/link";
import { HeroCopy, HeroPreview } from "@/components/landing/hero";
import { RolePicker } from "@/components/practice/role-picker";
import { EcgHero } from "@/components/motion/ecg";
import { Blobs, Reveal, RevealLi } from "@/components/motion/reveal";
import { buttonClass } from "@/components/ui";
import { t } from "@/i18n";
import { scenarioCards } from "@/lib/scenario-cards";

const STEP_ICONS = [MessagesSquare, Stethoscope, Award];

/** Landing: the framing, then «Та хэн бэ?» → role-filtered practice scenarios (no login needed). */
export default function LandingPage() {
  const startHref = "#roles";

  return (
    <main className="isolate">
      <section className="relative overflow-hidden">
        <Blobs />
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-10 pt-14 md:pt-20 lg:grid-cols-[1.15fr_1fr]">
          <HeroCopy startHref={startHref} />
          <HeroPreview />
        </div>
        {/* Heartbeat drawn across the full width */}
        <EcgHero className="h-16 sm:h-24" />
      </section>

      <RolePicker scenarios={scenarioCards()} />

      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">{t.landing.howTitle}</h2>
          <p className="mt-2 text-muted">{t.landing.howSubtitle}</p>
        </Reveal>
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {t.landing.steps.map((step, i) => {
            const Icon = STEP_ICONS[i];
            return (
              <RevealLi key={step.title} delay={i * 0.15} className="glass relative rounded-3xl p-6 text-center">
                  <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-ink shadow-lg shadow-brand-500/25">
                    <Icon size={26} aria-hidden />
                    <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-surface-solid text-xs font-bold text-accent ring-1 ring-line">
                      {i + 1}
                    </span>
                  </span>
                  <h3 className="mt-5 font-display text-xl font-bold">{step.title}</h3>
                  <p className="prose-mn mt-2 text-sm text-muted">{step.body}</p>
              </RevealLi>
            );
          })}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] bg-[#07131f] px-6 py-12 text-white ring-1 ring-white/10 md:px-14">
            <div aria-hidden className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />
            <LockKeyhole size={32} className="text-brand-300" aria-hidden />
            <h2 className="mt-4 font-display text-2xl font-extrabold sm:text-3xl">{t.landing.secureTitle}</h2>
            <p className="prose-mn mt-3 max-w-3xl text-white/70">{t.landing.secureBody}</p>
            <Link href={startHref} className={buttonClass("primary", "lg", "mt-8 rounded-2xl")}>
              {t.landing.start}
            </Link>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
