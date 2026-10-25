import { MapPin, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "@/i18n";
import { PatientView } from "../patient/patient-view";
import { Badge } from "../ui";

export interface IntroInfo {
  title: string;
  intro: string;
  setting: string;
  difficulty: string;
  timeCritical: boolean;
  patient: { name: string; age: number; sex: "male" | "female" };
}

/** Case intro: who the patient is, where you are and what to do. */
export function IntroCard({ info, children }: { info: IntroInfo; children?: ReactNode }) {
  return (
    <article className="glass rounded-[2rem] p-5 sm:p-7">
      <div className="flex items-center gap-4">
        <PatientView sex={info.patient.sex} age={info.patient.age} mood="pain" speaking={false} size="md" />
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap gap-1.5">
            <Badge tone="brand">{t.difficulty[info.difficulty]}</Badge>
            {info.timeCritical && (
              <Badge tone="rose">
                <Timer size={12} aria-hidden /> {t.cases.urgent}
              </Badge>
            )}
          </div>
          <h1 className="font-display text-xl font-extrabold leading-snug sm:text-2xl">{info.title}</h1>
          <p className="text-sm text-muted">{t.practice.patientLine(info.patient.name, info.patient.age)}</p>
        </div>
      </div>
      <p className="mt-4 flex items-start gap-1.5 text-sm font-semibold text-muted">
        <MapPin size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        {info.setting}
      </p>
      <p className="prose-mn mt-3 text-[15px] leading-relaxed">{info.intro}</p>
      {children}
    </article>
  );
}
