/** Colour for a 0–100 score (shared by server and client components). */
export function scoreTone(score: number) {
  if (score >= 80) return { stroke: "stroke-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
  if (score >= 55) return { stroke: "stroke-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { stroke: "stroke-rose-500", text: "text-rose-600 dark:text-rose-400" };
}
