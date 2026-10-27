import type { CoachDifficulty, CoachMode } from "./types";

/** Labels and links shared by the AI дасгалжуулагч, Баг and Дүгнэлт screens (as `CoachLabels` in the iOS app). */
export const MODE_LABELS: Record<CoachMode, string> = { video: "🎥 Видео", audio: "📞 Аудио" };
export const DIFFICULTY_LABELS: Record<CoachDifficulty, string> = { easy: "Тайван", medium: "Дунд", hard: "Хэцүү" };

export const modeLabel = (mode: string) => MODE_LABELS[mode as CoachMode] ?? mode;
export const difficultyLabel = (difficulty: string) => DIFFICULTY_LABELS[difficulty as CoachDifficulty] ?? difficulty;

/** The practice page for a persona (and, for a team challenge, the challenge it counts towards). */
export function coachHref(packRef: string, mode: string, difficulty: string, challengeId?: string) {
  const query = new URLSearchParams({ pack: packRef, mode, difficulty });
  if (challengeId) query.set("challenge", challengeId);
  return `/coach?${query.toString()}`;
}

/** Green from 80, amber from 60, red below. */
export function scoreColor(score: number) {
  return score >= 80 ? "text-ok bg-ok/15" : score >= 60 ? "text-warn bg-warn/15" : "text-alert bg-alert/15";
}
