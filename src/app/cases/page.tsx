import type { Metadata } from "next";
import { CaseRow, FeaturedCase } from "@/components/practice/case-cards";
import { dailyScenario, SCENARIOS } from "@/lib/practice/scenarios";

export const metadata: Metadata = { title: "Яаралтай тохиолдол" };

/** «Яаралтай тохиолдлын тоглоом»: offline emergency cases (as `PatientHub` in the iOS app). */
export default function CasesPage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-5 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-white">Яаралтай тохиолдол</h1>
        <p className="mt-1.5 text-sm text-white/90">Жинхэнэ өвчтөнөөс өмнө энд алдаад, энд сур.</p>
      </div>
      <FeaturedCase scenario={dailyScenario()} />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Бүх тохиолдол</h2>
        {SCENARIOS.map((s) => (
          <CaseRow key={s.id} scenario={s} />
        ))}
      </section>
    </main>
  );
}
