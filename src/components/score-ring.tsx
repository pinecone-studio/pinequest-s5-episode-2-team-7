export function scoreTone(score: number) {
  if (score >= 80) return { stroke: "stroke-emerald-500", text: "text-emerald-700" };
  if (score >= 55) return { stroke: "stroke-amber-500", text: "text-amber-700" };
  return { stroke: "stroke-rose-500", text: "text-rose-700" };
}

export function ScoreRing({ score, size = 112, label = "Нийт оноо" }: { score: number; size?: number; label?: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${label}: ${score} / 100`}>
        <circle cx="50" cy="50" r={r} className="fill-none stroke-slate-100" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={r}
          className={`fill-none ${tone.stroke}`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(Math.max(0, Math.min(100, score)) / 100) * c} ${c}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-2xl font-semibold ${tone.text}`} style={{ height: size }}>
        {Math.round(score)}
      </span>
    </div>
  );
}
