import type { Metadata } from "next";
import { ArrowRight, Clock, WifiOff } from "lucide-react";
import Link from "next/link";
import { Blobs, RevealLi } from "@/components/motion/reveal";
import { PatientView } from "@/components/patient/patient-view";
import { moodForCase } from "@/lib/mood";
import { buttonClass } from "@/components/ui";
import { t } from "@/i18n";
import { OFFLINE_CASES } from "@/lib/demo/offline-cases";

export const metadata: Metadata = { title: "Офлайн демо" };

export default function DemoPage() {
  return (
    <main className="relative isolate mx-auto w-full max-w-4xl px-4 py-12">
      <Blobs fixed />
      <p className="glass mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-accent">
        <WifiOff size={14} aria-hidden />
        {t.demo.banner}
      </p>
      <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{t.demo.title}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t.demo.subtitle}</p>

      <ul className="mt-8 grid gap-5 sm:grid-cols-2">
        {OFFLINE_CASES.map(({ public: c }, i) => (
          <RevealLi key={c.id} delay={i * 0.1} className="glass flex flex-col rounded-3xl p-6">
            <div className="flex items-center gap-4">
              <PatientView sex={c.patient.sex} age={c.patient.age} mood={moodForCase(c)} speaking={false} size="md" className="!h-20 !w-20" />
              <div>
                <p className="font-display text-lg font-bold">
                  {c.patient.name}, {c.patient.age}
                </p>
                <p className="text-sm text-muted">{c.patient.occupation?.mn}</p>
              </div>
            </div>
            <h2 className="mt-5 font-display text-xl font-bold">{c.displayTitle.mn}</h2>
            <p className="mt-1 flex items-center gap-3 text-sm text-muted">
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">{c.specialty}</span>
              <span className="flex items-center gap-1 text-xs">
                <Clock size={12} aria-hidden />
                {t.cases.minutes(c.estimatedMinutes)}
              </span>
            </p>
            <Link href={`/demo/${c.id}`} className={buttonClass("primary", "md", "group mt-6 w-full")}>
              {t.cases.start}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </RevealLi>
        ))}
      </ul>
      <p className="mt-8 text-sm">
        <Link href="/" className="font-semibold text-accent hover:underline">
          ← {t.demo.backToApp}
        </Link>
      </p>
    </main>
  );
}
