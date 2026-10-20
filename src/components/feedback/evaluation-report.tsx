import { RUBRIC_CATEGORY_LABELS, type EvaluationResult, type RubricResult } from "@/lib/evaluation/evaluator";
import { VERDICT_LABELS } from "@/lib/i18n";
import { ScoreRing } from "../score-ring";
import { Alert, Badge, Card, cn } from "../ui";

const VERDICT_TONE = { correct: "emerald", partial: "amber", differential: "amber", incorrect: "rose", empty: "rose" } as const;

export function EvaluationReport({ result, narrative, submittedReasoning }: { result: EvaluationResult; narrative: string | null; submittedReasoning: string | null }) {
  const d = result.diagnosis;
  const asked = result.items.filter((i) => i.covered).sort((a, b) => Number(b.critical) - Number(a.critical) || b.weight - a.weight);
  const missed = result.items.filter((i) => !i.covered).sort((a, b) => Number(b.critical) - Number(a.critical) || b.weight - a.weight);

  return (
    <div className="space-y-6">
      <Card className="grid gap-6 p-6 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center justify-center">
          <ScoreRing score={result.totalScore} size={128} />
          <p className="mt-2 text-xs text-slate-500">100 онооноос</p>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Онош</h2>
            <Badge tone={VERDICT_TONE[d.verdict]}>{VERDICT_LABELS[d.verdict]}</Badge>
          </div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">Таны онош</dt>
              <dd className="mt-0.5 font-medium">{d.submitted}</dd>
            </div>
            <div className="rounded-xl bg-brand-50 p-3">
              <dt className="text-xs text-brand-700">Хүлээгдэж буй онош</dt>
              <dd className="mt-0.5 font-medium text-brand-900">
                {d.expected}
                {d.expectedEn && <span className="block text-xs font-normal text-brand-700">{d.expectedEn}</span>}
              </dd>
            </div>
          </dl>
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            {d.notLeading && <li>• Зөв оношийг бичсэн боловч гол (эхний) онош болгоогүй тул хэсэгчилсэн оноо авлаа.</li>}
            {d.fuzzy && <li>• Бичлэгийн жижиг алдааг тэвчиж, «{d.matchedTerm}» гэж хүлээн авлаа.</li>}
            {d.verdict === "partial" && !d.notLeading && <li>• Таны хариулт зөв чиглэлтэй боловч хангалттай нарийвчлалгүй байна.</li>}
            {d.verdict === "differential" && <li>• «{d.differential}» нь энэ кейсийн ялган оношийн нэг — гол оношоос ялгах шинжийг доороос харна уу.</li>}
          </ul>
          {submittedReasoning && (
            <p className="mt-3 text-sm text-slate-600">
              <span className="font-medium text-slate-700">Таны үндэслэл:</span> {submittedReasoning}
            </p>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Онооны задаргаа</h2>
        <p className="mt-1 text-xs text-slate-500">
          Жин: онош {Math.round(result.weights.diagnosis * 100)}% · асуумжийн хамрах хүрээ {Math.round(result.weights.history * 100)}% · чухал асуулт{" "}
          {Math.round(result.weights.critical * 100)}%. Оноог дүрмээр тооцоолсон; AI оноонд нөлөөлөхгүй.
        </p>
        <div className="mt-4 space-y-4">
          <ScoreBar label="Онош" points={result.components.diagnosis.points} max={result.weights.diagnosis * 100} />
          <ScoreBar
            label="Асуумжийн хамрах хүрээ"
            detail={`${result.components.history.covered}/${result.components.history.total} асуулт`}
            points={result.components.history.points}
            max={result.weights.history * 100}
          />
          <ScoreBar
            label="Чухал асуулт"
            detail={`${result.components.critical.covered}/${result.components.critical.total} асуулт`}
            points={result.components.critical.points}
            max={result.weights.critical * 100}
          />
        </div>
        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {result.categories.map((cat) => (
            <div key={cat.category} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <span className="text-slate-600">{RUBRIC_CATEGORY_LABELS[cat.category]}</span>
              <span className={cn("font-medium", cat.covered === cat.total ? "text-emerald-700" : cat.covered === 0 ? "text-rose-700" : "text-amber-700")}>
                {cat.covered}/{cat.total}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Нийт {result.questionStats.total} асуулт · эмнэлзүйн {result.questionStats.clinical} · давтагдсан {result.questionStats.repeated} · ойлгомжгүй{" "}
          {result.questionStats.unclear}
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-emerald-800">Асуусан чухал асуултууд ({asked.length})</h2>
          {asked.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Үнэлгээний гол асуултаас асуугаагүй байна.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {asked.map((item) => (
                <RubricRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-rose-800">Орхигдсон асуултууд ({missed.length})</h2>
          {missed.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Бүх гол асуултыг асуусан байна. Сайн байна!</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {missed.map((item) => (
                <RubricRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Илрүүлсэн эмнэлзүйн мэдээлэл</h2>
        <p className="mt-1 text-sm text-slate-500">Таны асуултаар өвчтөний хэлсэн, оношид ач холбогдолтой мэдээлэл ба яагаад чухал болох нь.</p>
        {result.discoveredFindings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Чухал мэдээлэл илрүүлээгүй.</p>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {result.discoveredFindings.map((f) => (
              <li key={f.factId} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-sm">
                <p className="text-slate-700">«{f.text}»</p>
                {f.significance && <p className="mt-1.5 text-emerald-800">→ {f.significance}</p>}
              </li>
            ))}
          </ul>
        )}
        {result.missedFindings.length > 0 && (
          <details className="mt-5 rounded-xl border border-slate-200 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">Илрүүлээгүй мэдээлэл ({result.missedFindings.length})</summary>
            <ul className="mt-3 space-y-2">
              {result.missedFindings.map((f) => (
                <li key={f.factId} className="text-slate-600">
                  <span className="text-slate-800">«{f.text}»</span>
                  {f.significance && <span className="block text-xs text-slate-500">{f.significance}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Тайлбар</h2>
          <p className="prose-mn mt-3 text-sm text-slate-700">{d.explanation}</p>
          {result.differentials.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold">Ялган онош</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {result.differentials.map((x) => (
                  <li key={x.label}>
                    <span className="font-medium">{x.label}:</span> <span className="text-slate-600">{x.rationale}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Гол сургамж</h2>
          <p className="prose-mn mt-3 text-sm text-slate-700">{result.summary}</p>
          <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            {result.learningPoints.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {narrative && (
            <div className="mt-5 rounded-xl bg-slate-50 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold text-slate-500">AI-ийн бичсэн нэмэлт тайлбар (оноонд нөлөөлөхгүй)</p>
              <p className="prose-mn whitespace-pre-line text-slate-700">{narrative}</p>
            </div>
          )}
        </Card>
      </div>

      {result.emergencyNote && (
        <Alert tone="amber" title="Яаралтай тусламжийн зарчим">
          {result.emergencyNote}
        </Alert>
      )}
      <p className="text-xs text-slate-500">
        Энэхүү санал хүсэлт нь зөвхөн сургалтын зориулалттай бөгөөд эмнэлзүйн зөвлөгөө биш. Кейс зохиомол, эмнэлзүйн мэргэжилтэн хянаагүй байж болно.
      </p>
    </div>
  );
}

function ScoreBar({ label, points, max, detail }: { label: string; points: number; max: number; detail?: string }) {
  const pct = max > 0 ? Math.round((points / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">
          {label}
          {detail && <span className="ml-2 text-xs font-normal text-slate-500">{detail}</span>}
        </span>
        <span className="tabular-nums text-slate-600">
          {points} / {Math.round(max)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn("h-full rounded-full", pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RubricRow({ item }: { item: RubricResult }) {
  return (
    <li className={cn("rounded-xl border p-3 text-sm", item.covered ? "border-emerald-100" : item.critical ? "border-rose-200 bg-rose-50/40" : "border-slate-200")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{item.label}</span>
        {item.critical && <Badge tone={item.covered ? "emerald" : "rose"}>Чухал</Badge>}
        <Badge>{RUBRIC_CATEGORY_LABELS[item.category]}</Badge>
      </div>
      {item.covered && item.evidence ? (
        <p className="mt-1.5 text-slate-600">
          Таны асуулт: <span className="italic">«{item.evidence.text}»</span>
        </p>
      ) : (
        <p className="mt-1.5 text-slate-600">
          Жишээ асуулт: <span className="italic">«{item.suggestedQuestion}»</span>
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">Яагаад чухал вэ: {item.rationale}</p>
    </li>
  );
}
