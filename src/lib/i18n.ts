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

/**
 * Dates in Mongolia time (UTC+8, no daylight saving), the same on the server
 * (UTC on Vercel) and in any browser, so server-rendered client components
 * hydrate without a mismatch. Browsers have no "mn" locale data, so no Intl.
 */
function ulaanbaatar(iso: string) {
  const d = new Date(new Date(iso).getTime() + 8 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { y: d.getUTCFullYear(), m: pad(d.getUTCMonth() + 1), d: pad(d.getUTCDate()), time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}

export function formatDateTime(iso: string): string {
  const t = ulaanbaatar(iso);
  return `${t.y}.${t.m}.${t.d} ${t.time}`;
}

/** "10.27" for short due dates. */
export function formatDay(iso: string): string {
  const t = ulaanbaatar(iso);
  return `${t.m}.${t.d}`;
}
