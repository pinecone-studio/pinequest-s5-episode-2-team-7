"use client";

import { AnimatePresence, motion } from "motion/react";
import { Ambulance, ArrowRight, GraduationCap, Stethoscope, Syringe, Timer, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { t } from "@/i18n";
import type { ScenarioCard } from "@/lib/scenario-cards";
import { ROLES, isRole, type Role } from "@/lib/scenarios";
import { Badge, cn } from "../ui";

const ICONS: Record<Role, LucideIcon> = { student: GraduationCap, doctor: Stethoscope, nurse: Syringe, ambulance: Ambulance };
const STORAGE_KEY = "pq-role";
const CHANGE_EVENT = "pq-role-change";

function readRole(): Role | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isRole(value) ? value : null;
  } catch {
    return null;
  }
}

function saveRole(role: Role) {
  try {
    localStorage.setItem(STORAGE_KEY, role);
  } catch {
    // Private mode: the choice simply isn't remembered.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** «Та хэн бэ?»: the role filters the scenarios (students see all of them). */
export function RolePicker({ scenarios }: { scenarios: ScenarioCard[] }) {
  const role = useSyncExternalStore(subscribe, readRole, () => null);
  const visible = role === null ? [] : role === "student" ? scenarios : scenarios.filter((s) => s.roles.includes(role));

  return (
    <section id="roles" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
      <div className="text-center">
        <h2 className="font-display text-3xl font-extrabold sm:text-4xl">{t.practice.whoTitle}</h2>
        <p className="mt-2 text-muted">{t.practice.whoSubtitle}</p>
      </div>

      <div role="radiogroup" aria-label={t.practice.whoTitle} className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {ROLES.map((r) => {
          const Icon = ICONS[r];
          const active = role === r;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => saveRole(r)}
              className={cn(
                "glass flex min-h-32 flex-col items-center justify-center gap-2 rounded-3xl p-4 text-center transition-all",
                active ? "ring-2 ring-accent shadow-lg shadow-brand-500/20" : "hover:-translate-y-0.5",
              )}
            >
              <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", active ? "bg-accent text-accent-ink" : "bg-accent-soft text-accent")}>
                <Icon size={24} aria-hidden />
              </span>
              <span className="font-display text-base font-bold">{t.practice.roles[r].label}</span>
              <span className="text-xs text-muted">{t.practice.roles[r].hint}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {role && (
          <motion.div key={role} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-10">
            <h3 className="mb-4 font-display text-xl font-bold">{t.practice.scenariosTitle}</h3>
            {visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">{t.practice.noScenarios}</p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((s) => (
                  <li key={s.id}>
                    <Link href={`/practice/${s.id}`} className="glass group flex h-full flex-col gap-3 rounded-3xl p-5 transition-all hover:-translate-y-1 hover:shadow-xl">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone="brand">{t.difficulty[s.difficulty]}</Badge>
                        {s.timeCritical && (
                          <Badge tone="rose">
                            <Timer size={12} aria-hidden /> {t.cases.urgent}
                          </Badge>
                        )}
                      </div>
                      <p className="font-display text-lg font-bold leading-snug">{s.title}</p>
                      <p className="text-sm text-muted">
                        {t.practice.patientLine(s.patientName, s.patientAge)} · {s.setting}
                      </p>
                      <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-accent">
                        {t.practice.open}
                        <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
