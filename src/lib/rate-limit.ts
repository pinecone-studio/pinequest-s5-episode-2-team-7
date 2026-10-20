/**
 * In-memory sliding-window rate limiter.
 *
 * Limitation: on serverless platforms each instance has its own memory, so
 * this is a best-effort guard against accidental floods (and free-tier LLM
 * quota burn), not a security boundary. Use a shared store (e.g. Upstash
 * Redis) for strict limits.
 */
const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string, limit: number, windowMs = 60_000): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return { ok: false, retryAfterSeconds: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 10_000) {
    for (const [k, times] of buckets) if (times.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return { ok: true, retryAfterSeconds: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}
