"use client";

import { AlertTriangle, Ambulance, Camera, ChevronRight, FileText, Phone, PlusCircle, Sparkles, Trophy, Users, Video, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Button, cn, inputClass, Spinner, Textarea } from "@/components/ui";
import { apiFetch, ClientApiError } from "@/lib/fetcher";
import { readQuizFile, type QuizFile } from "@/lib/quiz-client";
import { coachHref, DIFFICULTY_LABELS, MODE_LABELS } from "@/lib/coach/labels";
import type { CoachDifficulty, CoachMode, PublicPack } from "@/lib/coach/types";


export interface NextChallenge {
  id: string;
  title: string;
  teamName: string;
  packRef: string;
  mode: string;
  difficulty: string;
  targetScore: number;
  myBest: number | null;
}

/**
 * «AI дасгалжуулагч» (the orb tab of the iOS app): pick a persona → video or
 * audio and difficulty → the practice page /coach?pack=…; or «AI custom»: the
 * company's own material becomes a persona for its new staff.
 */
export function CoachHub({
  builtin,
  custom,
  model,
  ownedTeams,
  next,
}: {
  builtin: PublicPack[];
  custom: PublicPack[];
  model: PublicPack[];
  ownedTeams: { id: string; name: string }[];
  next: NextChallenge | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<PublicPack | null>(null);
  const [showCustom, setShowCustom] = useState(false);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-5 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-white">AI дасгалжуулагч</h1>
        <p className="mt-1.5 text-sm text-white/90">Дүрээ сонго: AI тэр хүн болж видео эсвэл утсаар ярьж, дараа нь чамайг дүгнэнэ.</p>
      </div>

      {next && <ChallengeBanner item={next} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {builtin.map((pack) => (
          <button key={pack.id} type="button" onClick={() => setSelected(pack)} className="glass flex min-h-[170px] flex-col items-start gap-2 rounded-[22px] p-3.5 text-left transition hover:ring-1 hover:ring-accent/50">
            <span className="text-[34px] leading-none">{pack.icon}</span>
            <span className="line-clamp-1 font-semibold text-ink">{pack.title}</span>
            <span className="line-clamp-3 text-xs text-muted">{pack.subtitle}</span>
            <span className="mt-auto rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-deep">
              {MODE_LABELS[pack.defaultMode]}
              {pack.language === "en" && " · EN"}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className="flex min-h-[170px] flex-col items-start gap-2 rounded-[22px] border-[1.5px] border-dashed border-accent/50 bg-[#1e1734]/90 p-3.5 text-left"
        >
          <PlusCircle size={30} className="text-accent" aria-hidden />
          <span className="font-semibold text-ink">AI custom</span>
          <span className="line-clamp-4 text-xs text-muted">Компанийнхаа мэдээллийг PDF, зураг, текстээр оруулаад өөрийн дасгалжуулагчаа үүсгэ</span>
        </button>
      </div>

      {custom.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-lg font-semibold text-ink">Манай компанийн дүрүүд</h2>
          {custom.map((pack) => (
            <button key={pack.id} type="button" onClick={() => setSelected(pack)} className="glass flex w-full items-center gap-3 rounded-[20px] p-3 text-left">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[28px]">{pack.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{pack.title}</span>
                <span className="line-clamp-2 text-xs text-muted">{[pack.orgName, pack.subtitle].filter(Boolean).join(" · ")}</span>
              </span>
              {pack.teamId && <Users size={14} className="text-accent" aria-label="Багтай хуваалцсан" />}
              <ChevronRight size={18} className="text-subtle" aria-hidden />
            </button>
          ))}
        </section>
      )}

      {model.length > 0 && <ModelPatients packs={model} onPick={setSelected} />}

      <Link href="/cases" className="glass flex items-center gap-3.5 rounded-[22px] p-3.5">
        <span className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Ambulance size={24} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">Яаралтай тохиолдлын тоглоом</span>
          <span className="block text-xs text-muted">Осол, цээжний өвдөлт, анафилакс: цаг, амин үзүүлэлттэй сценари (сервергүй)</span>
        </span>
        <ChevronRight size={18} className="text-subtle" aria-hidden />
      </Link>

      {selected && <SetupSheet pack={selected} onClose={() => setSelected(null)} />}
      {showCustom && (
        <CustomSheet
          teamId={null}
          ownedTeams={ownedTeams}
          onClose={() => setShowCustom(false)}
          onCreated={(pack) => {
            setShowCustom(false);
            setSelected(pack);
            // Lists it under «Манай компанийн дүрүүд».
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

/** «Манай AI өвчтөн»: the cases our fine-tuned model was trained on, with its live status. */
function ModelPatients({ packs, onPick }: { packs: PublicPack[]; onPick: (pack: PublicPack) => void }) {
  const [status, setStatus] = useState<{ ok: boolean; detail: string } | null>(null);
  useEffect(() => {
    let stop = false;
    const check = () =>
      fetch("/api/coach/model")
        .then((r) => (r.ok ? r.json() : null))
        .then((s: { ok: boolean; detail: string } | null) => !stop && s && setStatus(s))
        .catch(() => undefined);
    void check();
    // A sleeping GPU takes a minute or two to wake: keep looking until it answers.
    const timer = window.setInterval(() => void check(), 30_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Манай AI өвчтөн</h2>
        <span
          className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", status?.ok ? "bg-ok/15 text-ok" : "bg-field text-muted")}
          title={status?.detail}
        >
          <span className={cn("h-2 w-2 rounded-full", status === null ? "animate-pulse bg-subtle" : status.ok ? "bg-ok" : "bg-warn")} />
          {status === null ? "Шалгаж байна…" : status.ok ? "Манай загвар ажиллаж байна" : "Загвар унтарсан — Claude орлоно"}
        </span>
      </div>
      <p className="text-xs text-muted">Бидний сургасан монгол хэлний өвчтөний загвар (Qwen3 + LoRA). Анамнез авч, онош тавих дадлага.</p>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        {packs.map((pack) => (
          <button key={pack.id} type="button" onClick={() => onPick(pack)} className="glass flex w-56 shrink-0 flex-col items-start gap-1.5 rounded-[22px] p-3.5 text-left">
            <span className="text-3xl leading-none">{pack.icon}</span>
            <span className="font-semibold text-ink">{pack.title}</span>
            <span className="line-clamp-2 text-xs text-muted">{pack.subtitle}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ChallengeBanner({ item }: { item: NextChallenge }) {
  return (
    <Link href={coachHref(item.packRef, item.mode, item.difficulty, item.id)} className="flex items-center gap-4 rounded-3xl bg-[#271c22] p-4 ring-1 ring-gold/40">
      <Trophy size={26} className="shrink-0 text-gold" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-gold">{item.teamName} · сорилт</span>
        <span className="block truncate font-semibold text-ink">{item.title}</span>
        <span className="block text-xs text-muted">
          Зорилт {item.targetScore}
          {item.myBest !== null && ` · Таны шилдэг ${item.myBest}`}
        </span>
      </span>
      <ChevronRight className="text-subtle" aria-hidden />
    </Link>
  );
}

/** A bottom sheet on phones, a centred panel on wider screens. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  // No close() on cleanup: it fires `close` → onClose, which would unmount the sheet
  // right after StrictMode's second effect run. Removing the element closes it anyway.
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[28px] border border-line bg-[#120f1b] p-0 text-ink backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-lg sm:rounded-[28px]"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#120f1b]/95 px-5 pb-2 pt-4 backdrop-blur">
        <h2 className="font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-field hover:text-ink" aria-label="Болих">
          <X size={18} />
        </button>
      </div>
      <div className="px-5 pb-6">{children}</div>
    </dialog>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-field p-1 ring-1 ring-line">
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn("flex-1 rounded-full px-3 py-2 text-sm font-semibold transition", value === id ? "bg-accent-gradient text-white" : "text-muted hover:text-ink")}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Before starting: video or audio, difficulty. */
function SetupSheet({ pack, onClose }: { pack: PublicPack; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<CoachMode>(pack.defaultMode);
  const [difficulty, setDifficulty] = useState<CoachDifficulty>("medium");
  return (
    <Sheet title={pack.title} onClose={onClose}>
      <div className="flex items-center gap-3.5">
        <span className="text-[44px] leading-none">{pack.icon}</span>
        <div>
          <p className="text-xl font-semibold">{pack.title}</p>
          <p className="text-sm text-muted">{pack.subtitle}</p>
        </div>
      </div>
      <p className="glass prose-mn mt-4 rounded-[20px] p-3.5 text-sm">{pack.brief}</p>
      {pack.draft && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-warn">
          <AlertTriangle size={14} aria-hidden /> Ноорог агуулга: мэргэжлийн байгууллагаар баталгаажуулна.
        </p>
      )}
      {pack.kind === "custom" && pack.factCount > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <FileText size={14} aria-hidden /> Компанийн материалаас {pack.factCount} баримт уншсан: таны хариуг эдгээртэй тулгаж дүгнэнэ.
        </p>
      )}

      <p className="mb-2 mt-5 font-semibold">Хэлбэр</p>
      <Segmented label="Хэлбэр" value={mode} onChange={setMode} options={Object.entries(MODE_LABELS) as [CoachMode, string][]} />
      <p className="mt-1.5 text-xs text-muted">{mode === "video" ? "Аватар нүүр тулж ярина." : "Утасны дуудлага шиг: зөвхөн дуу, арын чимээтэй."}</p>

      <p className="mb-2 mt-4 font-semibold">Хүндийн зэрэг</p>
      <Segmented label="Хүндийн зэрэг" value={difficulty} onChange={setDifficulty} options={Object.entries(DIFFICULTY_LABELS) as [CoachDifficulty, string][]} />

      <Button size="lg" className="mt-6 w-full" onClick={() => router.push(coachHref(pack.id, mode, difficulty))}>
        {mode === "video" ? <Video size={18} aria-hidden /> : <Phone size={18} aria-hidden />} Эхлэх
      </Button>
      <p className="mt-3 text-center text-xs text-subtle">Товч дарахгүйгээр зүгээр л ярина; AI-г тасалж ярьж болно. Дуусахад AI дүгнэлт өгнө.</p>
    </Sheet>
  );
}

const PERSONAS = [
  ["customer", "🛎️ Үйлчлүүлэгч"],
  ["caller", "🎧 Утсаар залгагч"],
  ["buyer", "🛍️ Худалдан авагч"],
  ["patient", "🩺 Өвчтөн"],
  ["student", "🎒 Сурагч"],
] as const;

/** «AI custom»: the company's own material → a persona for its new staff. */
export function CustomSheet({
  teamId,
  ownedTeams,
  onClose,
  onCreated,
}: {
  /** Share the new persona with this team (its owner only). */
  teamId: string | null;
  ownedTeams: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (pack: PublicPack) => void;
}) {
  const [orgName, setOrgName] = useState("");
  const [persona, setPersona] = useState<(typeof PERSONAS)[number][0]>("customer");
  const [mode, setMode] = useState<CoachMode>("video");
  const [files, setFiles] = useState<QuizFile[]>([]);
  const [notes, setNotes] = useState("");
  const [shareTeam, setShareTeam] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  async function add(list: FileList | null) {
    for (const file of Array.from(list ?? [])) {
      const read = await readQuizFile(file).catch(() => null);
      if (read) setFiles((prev) => [...prev, read].slice(0, 10));
      else setError(`«${file.name}»-ийг уншиж чадсангүй. Зураг, PDF эсвэл текст оруулна уу.`);
    }
  }

  async function create() {
    setWorking(true);
    setError(null);
    try {
      const { pack } = await apiFetch<{ pack: PublicPack }>("/api/coach/packs", {
        method: "POST",
        json: {
          orgName: orgName.trim(),
          persona,
          mode,
          files: files.map(({ name, mediaType, data }) => ({ name, mediaType, data })),
          notes,
          teamId: teamId ?? (shareTeam || null),
        },
      });
      onCreated(pack);
    } catch (e) {
      setError(e instanceof ClientApiError || e instanceof Error ? e.message : "Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Sheet title="AI custom" onClose={onClose}>
      <p className="text-sm text-muted">
        Компанийнхаа мэдээллийг (үнийн жагсаалт, журам, түгээмэл асуулт…) оруулахад AI тухайн компанийн үйлчлүүлэгчийн дүрд орж шинэ ажилтнаас асууж, дүгнэнэ.
      </p>

      <label htmlFor="org" className="mb-1.5 mt-5 block font-semibold">
        Компанийн нэр
      </label>
      <input id="org" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Жишээ: Нарны эмнэлэг" className={cn(inputClass, "h-11")} />

      <p className="mb-2 mt-5 font-semibold">AI хэн болох вэ?</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {PERSONAS.map(([id, text]) => (
          <button
            key={id}
            type="button"
            aria-pressed={persona === id}
            onClick={() => {
              setPersona(id);
              if (id === "caller") setMode("audio");
            }}
            className={cn("shrink-0 rounded-full px-3 py-2 text-sm font-medium", persona === id ? "bg-accent-gradient text-white" : "bg-field text-ink")}
          >
            {text}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <Segmented label="Хэлбэр" value={mode} onChange={setMode} options={Object.entries(MODE_LABELS) as [CoachMode, string][]} />
      </div>

      <p className="mb-2 mt-5 font-semibold">Материал</p>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => cameraInput.current?.click()} className="flex flex-col items-center gap-1.5 rounded-2xl bg-field py-3 text-xs font-medium">
          <Camera size={20} className="text-accent" aria-hidden /> Зураг авах
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} className="flex flex-col items-center gap-1.5 rounded-2xl bg-field py-3 text-xs font-medium">
          <FileText size={20} className="text-accent" aria-hidden /> Файл (PDF, зураг, текст)
        </button>
      </div>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void add(e.target.files).then(() => (e.target.value = ""))} />
      <input ref={fileInput} type="file" accept="image/*,application/pdf,.txt,.md" multiple className="hidden" onChange={(e) => void add(e.target.files).then(() => (e.target.value = ""))} />
      {files.map((f, i) => (
        <div key={i} className="mt-2 flex items-center gap-2 rounded-xl bg-field p-2.5 text-xs">
          <FileText size={14} className="text-accent" aria-hidden />
          <span className="flex-1 truncate">{f.name}</span>
          <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} aria-label={`${f.name} хасах`} className="text-subtle hover:text-ink">
            <X size={14} />
          </button>
        </div>
      ))}
      <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="эсвэл текстээр: үйлчилгээ, үнэ, ажлын цаг, журам…" className="mt-2" aria-label="Материал текстээр" />

      {teamId === null && ownedTeams.length > 0 && (
        <>
          <label htmlFor="share" className="mb-1.5 mt-5 block font-semibold">
            Багтай хуваалцах
          </label>
          <select id="share" value={shareTeam} onChange={(e) => setShareTeam(e.target.value)} className={cn(inputClass, "h-11")}>
            <option value="">Зөвхөн надад</option>
            {ownedTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </>
      )}

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <Button size="lg" className="mt-6 w-full" disabled={working || (files.length === 0 && !notes.trim())} onClick={() => void create()}>
        {working ? (
          <>
            <Spinner /> AI материалыг уншиж байна… (20–40 сек)
          </>
        ) : (
          <>
            <Sparkles size={18} aria-hidden /> Дасгалжуулагч үүсгэх
          </>
        )}
      </Button>
    </Sheet>
  );
}

