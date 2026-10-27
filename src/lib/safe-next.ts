/** Only allow same-site relative redirect targets (prevents open redirects). */
export function safeNext(value: string | string[] | undefined, fallback = "/"): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  return v;
}
