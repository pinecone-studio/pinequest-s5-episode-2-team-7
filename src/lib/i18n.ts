/**
 * Mongolian UI vocabulary for structured values. Kept in one place so
 * translations can be reviewed and improved without touching components.
 */
export const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Анхан шат",
  intermediate: "Дунд шат",
  advanced: "Ахисан шат",
};

export const SEX_LABELS: Record<string, string> = { male: "Эрэгтэй", female: "Эмэгтэй" };

export const SESSION_STATUS_LABELS: Record<string, string> = {
  active: "Үргэлжилж байна",
  completed: "Дууссан",
  abandoned: "Зогсоосон",
};

export const VERDICT_LABELS: Record<string, string> = {
  correct: "Зөв",
  partial: "Хэсэгчлэн зөв",
  differential: "Ялган онош",
  incorrect: "Буруу",
  empty: "Оруулаагүй",
};

export const NEWS_CATEGORY_LABELS: Record<string, string> = {
  general: "Ерөнхий",
  research: "Судалгаа",
  "public-health": "Нийгмийн эрүүл мэнд",
  clinical: "Клиник",
  education: "Боловсрол",
};

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
