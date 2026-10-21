import type { PublicCase } from "./views";

export type Mood = "calm" | "uneasy" | "pain" | "severe";

/**
 * The case has no mood field, so the expression is inferred from public
 * information only (urgency, vitals, complaint wording) — never the diagnosis.
 */
export function moodForCase(c: Pick<PublicCase, "timeCritical" | "chiefComplaint" | "initialVitals">): Mood {
  const v = c.initialVitals;
  const unstable = !!v && ((v.heartRate ?? 80) > 110 || (v.spo2 ?? 99) < 92 || (v.temperatureC ?? 37) >= 39);
  if (c.timeCritical && unstable) return "severe";
  if (/өвд|хатгу|базал/i.test(c.chiefComplaint.mn)) return c.timeCritical ? "severe" : "pain";
  if (c.timeCritical || unstable) return "pain";
  return "uneasy";
}
