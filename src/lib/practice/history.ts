/** Finished emergency cases, kept in this browser (as `ScenarioHistory` on the phone). */

export interface ScenarioResult {
  id: string;
  scenarioId: string;
  title: string;
  date: string;
  /** 0…100 */
  score: number;
  seconds: number;
  stable: boolean;
}

const KEY = "otech-scenario-history";
const EMPTY: ScenarioResult[] = [];
let cached: ScenarioResult[] | null = null;
const listeners = new Set<() => void>();

function read(): ScenarioResult[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as ScenarioResult[];
  } catch {
    return EMPTY;
  }
}

/** useSyncExternalStore source for the results list. */
export const scenarioHistory = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot: (): ScenarioResult[] => (cached ??= read()),
  serverSnapshot: (): ScenarioResult[] => EMPTY,
};

export function saveScenarioResult(result: Omit<ScenarioResult, "id" | "date">) {
  const next = [{ ...result, id: crypto.randomUUID(), date: new Date().toISOString() }, ...scenarioHistory.snapshot()].slice(0, 100);
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the result is still shown, just not kept.
  }
  listeners.forEach((l) => l());
}

export const bestScore = (results: ScenarioResult[], scenarioId: string) =>
  results.filter((r) => r.scenarioId === scenarioId).reduce<number | null>((best, r) => (best === null || r.score > best ? r.score : best), null);
