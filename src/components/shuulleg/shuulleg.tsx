"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { BookOpen, Camera, ChevronLeft, ChevronRight, FileText, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { ScoreRing } from "@/components/score-ring";
import { Alert, Badge, Button, Card, cn, Spinner, Textarea } from "@/components/ui";
import { ClientApiError } from "@/lib/fetcher";
import {
  QUESTION_KINDS,
  quizApi,
  quizHistory,
  readQuizFile,
  removeAttempt,
  saveAttempt,
  startOralExam,
  takeOralResult,
  type Grade,
  type GradeItem,
  type Lesson,
  type Quiz,
  type QuizAttempt,
  type QuizFile,
  type QuizQuestion,
} from "@/lib/quiz-client";

/**
 * «Шүүлэг» on the web: the student adds study material, Claude writes an
 * exam, the student answers (typed here, or aloud to the examiner avatar on
 * /exam), and the answers are graded like an oral exam with what to study next.
 */

type Stage = { name: "setup" } | { name: "answering"; quiz: Quiz; prefill: string[] } | { name: "result"; quiz: Quiz; answers: string[]; grade: Grade };

function message(error: unknown): string {
  return error instanceof ClientApiError || error instanceof Error ? error.message : "Алдаа гарлаа. Дахин оролдоно уу.";
}

export function Shuulleg({ topic = "" }: { topic?: string }) {
  const [stage, setStage] = useState<Stage>({ name: "setup" });
  const [files, setFiles] = useState<QuizFile[]>([]);
  const [notes, setNotes] = useState(topic);
  const [types, setTypes] = useState<QuizQuestion["kind"][]>(["choice", "open", "case"]);
  const [count, setCount] = useState(5);
  const [oral, setOral] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const history = useSyncExternalStore(quizHistory.subscribe, quizHistory.snapshot, quizHistory.serverSnapshot);
  const router = useRouter();

  // Coming back from the examiner (/exam): grade the spoken answers, or continue typed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("oral")) return;
    window.history.replaceState(null, "", "/soril");
    const back = takeOralResult();
    if (!back) return;
    void Promise.resolve().then(() => {
      if (params.get("oral") === "done" && back.answers) void grade(back.quiz, back.answers);
      else setStage({ name: "answering", quiz: back.quiz, prefill: [] });
    });
    // Runs once on arrival.
  }, []);

  async function generate(focus: string[] = []) {
    setError(null);
    setBusy(focus.length ? "Сул тал дээр тань шинэ асуулт бэлдэж байна…" : "Материалыг уншиж, асуулт бэлдэж байна…");
    try {
      const quiz = await quizApi.generate(files, notes, count, focus, types.length ? types : ["open"]);
      if (oral) {
        startOralExam(quiz);
        router.push("/exam");
        return;
      }
      setStage({ name: "answering", quiz, prefill: [] });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  }

  async function grade(quiz: Quiz, answers: string[]) {
    setError(null);
    setStage({ name: "answering", quiz, prefill: answers });
    setBusy("Багш хариултыг тань шалгаж байна…");
    try {
      const result = await quizApi.grade(quiz, answers);
      saveAttempt({ id: crypto.randomUUID(), date: new Date().toISOString(), quiz, answers, grade: result });
      setStage({ name: "result", quiz, answers, grade: result });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative">
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {stage.name === "setup" && (
        <>
          <Setup files={files} setFiles={setFiles} notes={notes} setNotes={setNotes} count={count} setCount={setCount} types={types} setTypes={setTypes} oral={oral} setOral={setOral} onStart={() => void generate()} busy={!!busy} onError={setError} />
          <History attempts={history} onOpen={(a) => setStage({ name: "result", quiz: a.quiz, answers: a.answers, grade: a.grade })} onRemove={removeAttempt} />
        </>
      )}
      {stage.name === "answering" && (
        <Answering key={stage.quiz.title + stage.prefill.length} quiz={stage.quiz} prefill={stage.prefill} busy={!!busy} onFinish={(answers) => void grade(stage.quiz, answers)} onCancel={() => setStage({ name: "setup" })} />
      )}
      {stage.name === "result" && (
        <Result
          quiz={stage.quiz}
          answers={stage.answers}
          grade={stage.grade}
          onRetryWeak={stage.grade.weaknesses.length && (files.length || notes.trim()) ? () => void generate(stage.grade.weaknesses) : undefined}
          onRestart={() => setStage({ name: "setup" })}
        />
      )}
      {busy && <BusyOverlay text={busy} />}
    </div>
  );
}

/* ---------- Setup ---------- */

function Setup(props: {
  files: QuizFile[];
  setFiles: (f: QuizFile[] | ((prev: QuizFile[]) => QuizFile[])) => void;
  notes: string;
  setNotes: (v: string) => void;
  count: number;
  setCount: (n: number) => void;
  types: QuizQuestion["kind"][];
  setTypes: (t: QuizQuestion["kind"][]) => void;
  oral: boolean;
  setOral: (v: boolean) => void;
  onStart: () => void;
  busy: boolean;
  onError: (m: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const canStart = (props.files.length > 0 || props.notes.trim().length > 0) && props.types.length > 0;

  async function add(list: FileList | null) {
    if (!list) return;
    for (const file of Array.from(list)) {
      try {
        const read = await readQuizFile(file);
        if (read) props.setFiles((prev) => [...prev, read].slice(0, 10));
        else props.onError(`«${file.name}» төрлийн файлыг уншиж чадахгүй. Зураг, PDF эсвэл текст оруулна уу.`);
      } catch {
        props.onError(`«${file.name}»-ийг уншиж чадсангүй.`);
      }
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold">Материалаа оруул</h2>
      <p className="mt-1 text-sm text-muted">Лекц, номын хуудас, тэмдэглэлийнхээ зураг, PDF эсвэл сэдвээ оруул. AI багш асуулт бэлдэж, хариултыг чинь дүгнээд юуг дутуу, буруу хэлснийг хэлж өгнө.</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <SourceButton icon={<Camera className="h-6 w-6" />} label="Зураг авах" onClick={() => cameraInput.current?.click()} />
        <SourceButton icon={<FileText className="h-6 w-6" />} label="Файл (зураг, PDF)" onClick={() => fileInput.current?.click()} />
      </div>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void add(e.target.files).then(() => (e.target.value = ""))} />
      <input ref={fileInput} type="file" accept="image/*,application/pdf,.txt,.md" multiple className="hidden" onChange={(e) => void add(e.target.files).then(() => (e.target.value = ""))} />

      {props.files.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {props.files.map((f, i) => (
            <div key={i} className="relative h-20 w-20 overflow-hidden rounded-xl border border-line bg-sunken">
              {f.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.preview} alt={f.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 p-1 text-center text-[10px] text-muted">
                  <FileText className="h-5 w-5 text-accent" />
                  <span className="line-clamp-2">{f.name}</span>
                </div>
              )}
              <button type="button" aria-label={`${f.name} хасах`} onClick={() => props.setFiles((prev) => prev.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <label htmlFor="shuulleg-notes" className="mb-1.5 mt-5 block text-sm font-semibold">
        Сэдэв эсвэл тэмдэглэл
      </label>
      <Textarea id="shuulleg-notes" rows={3} value={props.notes} onChange={(e) => props.setNotes(e.target.value)} placeholder="Жишээ: Уурласан үйлчлүүлэгчтэй харьцах журам" />

      <p className="mb-2 mt-5 text-sm font-semibold">Асуултын төрөл</p>
      <div className="flex gap-2">
        {QUESTION_KINDS.map((kind) => {
          const on = props.types.includes(kind.id);
          return (
            <button
              key={kind.id}
              type="button"
              aria-pressed={on}
              onClick={() => props.setTypes(on ? props.types.filter((t) => t !== kind.id) : [...props.types, kind.id])}
              className={cn("flex-1 rounded-full px-3 py-2 text-sm font-semibold ring-1 ring-line", on ? "bg-accent text-white" : "bg-surface text-ink")}
            >
              {on && "✓ "}
              {kind.label}
            </button>
          );
        })}
      </div>
      {props.types.length === 0 && <p className="mt-1.5 text-xs text-alert">Дор хаяж нэг төрөл сонгоно уу.</p>}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm">
          <span>Асуултын тоо</span>
          <div className="flex items-center rounded-xl border border-line">
            <button type="button" aria-label="Цөөлөх" className="px-3 py-1.5 disabled:opacity-40" disabled={props.count <= 3} onClick={() => props.setCount(props.count - 1)}>
              −
            </button>
            <span className="w-8 text-center font-semibold tabular-nums">{props.count}</span>
            <button type="button" aria-label="Нэмэх" className="px-3 py-1.5 disabled:opacity-40" disabled={props.count >= 10} onClick={() => props.setCount(props.count + 1)}>
              +
            </button>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <span>
            <span className="block font-medium">AI шүүлэгч дуугаар асууна</span>
            <span className="block text-xs text-subtle">Видео шүүлэгч асуултаа хэлж, та дуугаар хариулна</span>
          </span>
          <input type="checkbox" checked={props.oral} onChange={(e) => props.setOral(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
        </label>
      </div>

      <Button size="lg" className="mt-6 w-full" disabled={!canStart || props.busy} onClick={props.onStart}>
        <Sparkles className="h-5 w-5" /> Асуулт бэлдэх
      </Button>
    </Card>
  );
}

function SourceButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-accent-soft px-3 py-5 text-sm font-medium text-accent transition-colors hover:brightness-110">
      {icon}
      {label}
    </button>
  );
}

/* ---------- Answering (typed) ---------- */

function Answering({ quiz, prefill, busy, onFinish, onCancel }: { quiz: Quiz; prefill: string[]; busy: boolean; onFinish: (answers: string[]) => void; onCancel: () => void }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState(() => quiz.questions.map((_, i) => prefill[i] ?? ""));
  const q = quiz.questions[index];
  const last = index === quiz.questions.length - 1;
  const set = (value: string) => setAnswers((prev) => prev.map((a, i) => (i === index ? value : a)));

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm text-muted">{quiz.title}</p>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Болих
        </Button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((index + 1) / quiz.questions.length) * 100}%` }} />
      </div>
      <p className="mt-4 text-xs font-semibold text-accent">
        Асуулт {index + 1} / {quiz.questions.length}
      </p>
      <h2 className="mt-1 text-lg font-semibold leading-snug">{q.prompt}</h2>

      {q.kind === "choice" ? (
        <div className="mt-4 grid gap-2">
          {q.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => set(option)}
              className={cn("rounded-xl border px-4 py-3 text-left text-sm transition-colors", answers[index] === option ? "border-accent bg-accent-soft" : "border-line hover:bg-sunken")}
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <Textarea className="mt-4" rows={7} value={answers[index]} onChange={(e) => set(e.target.value)} placeholder="Хариултаа бич…" />
      )}

      <div className="mt-5 flex gap-3">
        {index > 0 && (
          <Button variant="secondary" className="flex-1" onClick={() => setIndex(index - 1)}>
            <ChevronLeft className="h-4 w-4" /> Өмнөх
          </Button>
        )}
        <Button className="flex-1" disabled={busy} onClick={() => (last ? onFinish(answers) : setIndex(index + 1))}>
          {last ? "Дуусгаж шалгуулах" : "Дараах"} <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

/* ---------- Result ---------- */

const STATUS: Record<GradeItem["status"], { label: string; tone: "emerald" | "amber" | "rose" | "slate" }> = {
  correct: { label: "Зөв", tone: "emerald" },
  partial: { label: "Дутуу", tone: "amber" },
  wrong: { label: "Буруу", tone: "rose" },
  blank: { label: "Хариулаагүй", tone: "slate" },
};

function Result({ quiz, answers, grade, onRetryWeak, onRestart }: { quiz: Quiz; answers: string[]; grade: Grade; onRetryWeak?: () => void; onRestart: () => void }) {
  const [topic, setTopic] = useState<{ topic: string; why: string } | null>(null);
  return (
    <div className="grid gap-4">
      <Card className="flex flex-col items-center gap-5 p-6 sm:flex-row">
        <ScoreRing score={grade.score} />
        <div>
          <h2 className="font-display text-xl font-bold">{quiz.title}</h2>
          <p className="mt-1 text-sm text-muted">{grade.verdict}</p>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {grade.strengths.length > 0 && <Bullets title="Сайн байсан" tone="emerald" lines={grade.strengths} />}
        {grade.weaknesses.length > 0 && <Bullets title="Сайжруулах" tone="amber" lines={grade.weaknesses} />}
      </div>

      <h3 className="mt-2 font-display text-lg font-bold">Асуулт бүрээр</h3>
      {quiz.questions.map((q, i) => {
        const item = grade.items[i];
        if (!item) return null;
        return (
          <Card key={q.id} className="p-5">
            <div className="flex items-center justify-between gap-2">
              <Badge tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Badge>
              <span className="text-xs font-semibold text-muted">{Math.round(item.score)}/10</span>
            </div>
            <p className="mt-2 font-semibold">
              {i + 1}. {q.prompt}
            </p>
            {answers[i] && <p className="mt-1 text-sm text-subtle">Таны хариулт: {answers[i]}</p>}
            <p className="mt-2 text-sm">{item.feedback}</p>
            {item.mistakes.length > 0 && <List title="Буруу хэлсэн" className="text-alert" lines={item.mistakes} />}
            {item.missing.length > 0 && <List title="Дутуу хэлсэн" className="text-amber-600 dark:text-amber-300" lines={item.missing} />}
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-accent">Жишиг хариулт</summary>
              <p className="mt-1 text-muted">{q.modelAnswer}</p>
            </details>
          </Card>
        );
      })}

      {grade.studyNext.length > 0 && (
        <Card className="p-5">
          <h3 className="font-display text-lg font-bold">Цааш судлах уу?</h3>
          <p className="mt-1 text-sm text-muted">Алдаан дээр чинь үндэслэн AI богино хичээл бэлдэж өгнө.</p>
          <div className="mt-3 grid gap-2">
            {grade.studyNext.map((t) => (
              <button key={t.topic} type="button" onClick={() => setTopic(t)} className="flex items-start gap-3 rounded-xl bg-accent-soft p-3 text-left transition-colors hover:brightness-110">
                <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{t.topic}</span>
                  <span className="block text-xs text-muted">{t.why}</span>
                </span>
                <ChevronRight className="mt-0.5 h-4 w-4 text-subtle" />
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        {onRetryWeak && (
          <Button size="lg" className="flex-1" onClick={onRetryWeak}>
            <RotateCcw className="h-4 w-4" /> Сул тал дээрээ дахин шалгуулах
          </Button>
        )}
        <Button size="lg" variant="secondary" className="flex-1" onClick={onRestart}>
          Шинэ материал
        </Button>
      </div>

      {topic && <LessonDialog topic={topic} quiz={quiz} onClose={() => setTopic(null)} />}
    </div>
  );
}

function Bullets({ title, tone, lines }: { title: string; tone: "emerald" | "amber"; lines: string[] }) {
  return (
    <Card className={cn("p-5", tone === "emerald" ? "bg-emerald-500/8" : "bg-amber-500/8")}>
      <p className={cn("font-semibold", tone === "emerald" ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300")}>{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </Card>
  );
}

function List({ title, className, lines }: { title: string; className: string; lines: string[] }) {
  return (
    <div className="mt-3">
      <p className={cn("text-xs font-bold", className)}>{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function LessonDialog({ topic, quiz, onClose }: { topic: { topic: string; why: string }; quiz: Quiz; onClose: () => void }) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<number[]>([]);

  useEffect(() => {
    let live = true;
    quizApi
      .explain(topic, quiz)
      .then((l) => live && setLesson(l))
      .catch((e: unknown) => live && setError(message(e)));
    return () => {
      live = false;
    };
  }, [topic, quiz]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={topic.topic} className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-surface-solid p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-bold">{lesson?.title ?? topic.topic}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Хаах">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {error ? (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        ) : !lesson ? (
          <p className="mt-6 flex items-center gap-3 text-sm text-muted">
            <Spinner /> «{topic.topic}» сэдвээр хичээл бэлдэж байна…
          </p>
        ) : (
          <>
            <div className="prose-mn mt-4 space-y-3 text-sm">
              {lesson.lesson.split(/\n\s*\n/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {lesson.keyFacts.length > 0 && (
              <div className="mt-5 rounded-2xl bg-accent-soft p-4">
                <p className="text-sm font-semibold text-accent">Гол баримтууд</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {lesson.keyFacts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {lesson.selfCheck.length > 0 && (
              <div className="mt-5 grid gap-2">
                <p className="text-sm font-semibold">Өөрийгөө шалга</p>
                {lesson.selfCheck.map((c, i) => (
                  <div key={i} className="rounded-xl border border-line p-3 text-sm">
                    <p className="font-medium">{c.question}</p>
                    {shown.includes(i) ? (
                      <p className="mt-1 text-muted">{c.answer}</p>
                    ) : (
                      <button type="button" className="mt-1 text-accent" onClick={() => setShown((s) => [...s, i])}>
                        Хариуг харах
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- History ---------- */

function History({ attempts, onOpen, onRemove }: { attempts: QuizAttempt[]; onOpen: (a: QuizAttempt) => void; onRemove: (id: string) => void }) {
  if (attempts.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-lg font-bold">Өмнөх шүүлгүүд</h2>
      <div className="grid gap-2">
        {attempts.map((a) => (
          <Card key={a.id} className="flex items-center gap-3 p-3">
            <button type="button" onClick={() => onOpen(a)} className="flex flex-1 items-center gap-3 text-left">
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-bold tabular-nums", a.grade.score >= 80 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : a.grade.score >= 50 ? "bg-amber-500/15 text-amber-600 dark:text-amber-300" : "bg-alert-soft text-alert")}>
                {a.grade.score}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{a.quiz.title}</span>
                <span className="block text-xs text-subtle">{new Date(a.date).toLocaleString("mn-MN")}</span>
              </span>
            </button>
            <Button variant="ghost" size="sm" aria-label="Устгах" onClick={() => onRemove(a.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>
      <p className="mt-2 text-xs text-subtle">Түүх зөвхөн энэ хөтөч дээр хадгалагдана.</p>
    </section>
  );
}

function BusyOverlay({ text }: { text: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-6 backdrop-blur-md" role="status">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <Spinner className="h-8 w-8 text-accent" />
        <p className="font-semibold">{text}</p>
        <p className="text-xs text-subtle">Энэ хэсэг 30–60 секунд үргэлжилж болно.</p>
      </div>
    </div>
  );
}
