"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetcher";
import type { CoachDebrief, CoachDifficulty, CoachEmotion, CoachMode, PublicPack } from "@/lib/coach/types";
import type { VoiceFeatures } from "@/lib/views";
import { AnamAvatar } from "../interview/anam-avatar";
import { Recorder } from "../interview/recorder";
import type { AvatarHandle } from "../interview/simli-avatar";
import { ScoreRing } from "../score-ring";
import { Spinner, cn } from "../ui";
import { CoachCall, type ChatLine, type EndReason } from "./coach-call";

/**
 * «AI дасгалжуулагч» practice page, opened by the Otech AI iOS app (or a browser):
 * /coach?pack=callcenter&mode=audio&difficulty=medium&challenge=<id>
 *
 * video: the persona's face (Anam) talks with the persona's voice.
 * audio: a phone call — ring tone, telephone-quality voice, no face.
 * When it ends, the conversation is graded, saved (counted for the team
 * challenge if there is one) and the feedback is shown here.
 */

type Phase = "loading" | "intro" | "ringing" | "connecting" | "live" | "grading" | "done" | "error";

const EMOTION_UI: Record<CoachEmotion, { label: string; emoji: string }> = {
  calm: { label: "тайван", emoji: "🙂" },
  worried: { label: "санаа зовсон", emoji: "😟" },
  in_pain: { label: "өвдөж байна", emoji: "😣" },
  scared: { label: "айсан", emoji: "😨" },
  panicked: { label: "сандарсан", emoji: "😰" },
  angry: { label: "уурласан", emoji: "😠" },
};

const DIFFICULTY_LABEL: Record<CoachDifficulty, string> = { easy: "Тайван", medium: "Дунд", hard: "Хэцүү" };

declare global {
  interface Window {
    webkit?: { messageHandlers?: { otoch?: { postMessage(message: unknown): void } } };
  }
}

/** Tell the iOS app (no-op in a normal browser). */
function toApp(message: { type: "coachDone"; resultId: string; score: number; title: string } | { type: "close" }): boolean {
  const app = window.webkit?.messageHandlers?.otoch;
  if (!app) return false;
  app.postMessage(message);
  return true;
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface Result {
  id: string;
  debrief: CoachDebrief;
  challenge: { id: string; title: string; targetScore: number; passed: boolean } | null;
}

export function CoachSession({ packRef, mode: askedMode, difficulty, challengeId }: { packRef: string; mode?: CoachMode; difficulty: CoachDifficulty; challengeId: string | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [pack, setPack] = useState<PublicPack | null>(null);
  const [voice, setVoice] = useState<VoiceFeatures | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [status, setStatus] = useState("");
  const [source, setSource] = useState<"model" | "claude" | null>(null);
  const [emotion, setEmotion] = useState<CoachEmotion>("calm");
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [typed, setTyped] = useState("");
  const [recording, setRecording] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [avatarOn, setAvatarOn] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const callRef = useRef<CoachCall | null>(null);
  const avatarRef = useRef<AvatarHandle>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const liveResolve = useRef<(() => void) | null>(null);
  const stopRing = useRef<(() => void) | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  const mode: CoachMode = askedMode ?? pack?.defaultMode ?? "audio";
  const video = mode === "video" && Boolean(voice?.avatar && voice.avatarProvider === "anam");

  useEffect(() => {
    apiFetch<{ pack: PublicPack; voice: VoiceFeatures }>(`/api/coach/packs/${encodeURIComponent(packRef)}`)
      .then(({ pack, voice }) => {
        setPack(pack);
        setVoice(voice);
        setEmotion(pack.openingEmotion);
        setPhase("intro");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Дадлагыг ачаалж чадсангүй.");
        setPhase("error");
      });
  }, [packRef]);

  useEffect(() => {
    return () => {
      stopRing.current?.();
      void callRef.current?.finish("stopped");
      void recorderRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [chat, showChat]);

  async function grade(call: CoachCall, reason: EndReason) {
    if (!pack) return;
    setPhase("grading");
    if (!call.history.some((h) => h.role === "me" && h.text !== "(чимээгүй)")) {
      setError(reason === "timeout" ? "Хугацаа дууслаа. Та юу ч хэлээгүй тул дүгнэх зүйл алга." : "Та юу ч хэлээгүй тул дүгнэх зүйл алга.");
      setPhase("error");
      return;
    }
    try {
      const r = await apiFetch<Result>("/api/coach/debrief", {
        method: "POST",
        json: { packRef: pack.id, mode, difficulty, history: call.history, durationSec: call.elapsed(), challengeId },
      });
      setResult(r);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Дүгнэлт гарсангүй.");
      setPhase("error");
    }
  }

  async function start() {
    if (!pack) return;
    const call = new CoachCall(pack, mode, difficulty, () => avatarRef.current, {
      chat: setChat,
      status: setStatus,
      emotion: setEmotion,
      speaking: setSpeaking,
      listening: setListening,
      tick: setSeconds,
      ended: (reason) => void grade(call, reason),
      source: setSource,
    });
    callRef.current = call;
    await call.prepare(); // inside the tap: unlocks audio
    if (!video) {
      stopRing.current = call.ring();
      setPhase("ringing");
      return;
    }
    setPhase("connecting");
    // Ask for the microphone while the tap still counts as a user gesture.
    await navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => s.getTracks().forEach((t) => t.stop()))
      .catch(() => {});
    setAvatarOn(true);
    // Wait for the face (max 12 s); without it the persona talks as audio only.
    await new Promise<void>((resolve) => {
      liveResolve.current = resolve;
      setTimeout(resolve, 12_000);
    });
    liveResolve.current = null;
    setPhase("live");
    await call.begin();
  }

  async function answer() {
    const call = callRef.current;
    if (!call) return;
    stopRing.current?.();
    stopRing.current = null;
    call.beep(660, 0.08);
    setPhase("live");
    await call.begin();
  }

  function hangUp() {
    void callRef.current?.finish("stopped");
  }

  function sendTyped() {
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    callRef.current?.say(text);
  }

  /** Mic button: an alternative to hands-free (noisy rooms). First tap records, second sends. */
  async function toggleMic() {
    const call = callRef.current;
    if (!call) return;
    if (recorderRef.current) {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      setRecording(false);
      const wav = await recorder.stop();
      call.manual = false;
      call.pauseListening(false);
      await call.userEnded(wav);
      return;
    }
    call.manual = true;
    call.pauseListening(true);
    const recorder = new Recorder();
    recorder.onLimit = () => void toggleMic();
    try {
      await recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      call.manual = false;
      call.pauseListening(false);
      setStatus("Микрофон ашиглах зөвшөөрөл алга.");
    }
  }

  function close() {
    if (!toApp({ type: "close" })) window.history.back();
  }

  function finishToApp() {
    if (result && pack && toApp({ type: "coachDone", resultId: result.id, score: result.debrief.score, title: pack.title })) return;
    router.push(result ? `/feedback/${result.id}` : "/coach");
  }

  // --- render ---------------------------------------------------------------

  if (phase === "loading") {
    return (
      <main className="fixed inset-0 z-50 flex items-center justify-center bg-[#09080f] text-[#c9c4e0]">
        <Spinner />
      </main>
    );
  }

  if (!pack || phase === "error") {
    return (
      <main className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#09080f] p-6 text-center text-[#ffffff]">
        <p className="max-w-sm text-sm text-[#fda4af]">{error ?? "Алдаа гарлаа."}</p>
        <div className="flex gap-3">
          {pack && (
            <button onClick={() => window.location.reload()} className="rounded-full bg-[#8b5cf6] px-6 py-3 text-sm font-semibold text-[#ffffff]">
              Дахин оролдох
            </button>
          )}
          <button onClick={close} className="rounded-full border border-[#352e4a] px-6 py-3 text-sm">
            Хаах
          </button>
        </div>
      </main>
    );
  }

  if (phase === "done" && result) {
    const d = result.debrief;
    const icon = { yes: "✅", partial: "🟡", no: "❌" } as const;
    return (
      <main className="fixed inset-0 z-50 overflow-y-auto bg-[#09080f] text-[#ffffff]">
        <div className="mx-auto flex max-w-xl flex-col gap-5 p-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-4">
            <ScoreRing score={d.score} size={104} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[#a7a2c3]">
                {pack.icon} {pack.title} · {fmt(seconds)} · {DIFFICULTY_LABEL[difficulty]}
              </p>
              <p className="mt-1 text-sm leading-snug text-[#e2def5]">{d.summary}</p>
            </div>
          </div>
          {result.challenge && (
            <div className={cn("rounded-2xl px-4 py-3 text-sm", result.challenge.passed ? "bg-[#16a35a]/20 text-[#86efac]" : "bg-[#f59e0b]/15 text-[#fcd34d]")}>
              {result.challenge.passed
                ? `🏆 «${result.challenge.title}» сорилтыг биелүүллээ (зорилт ${result.challenge.targetScore}). Менежерт тань мэдэгдэнэ.`
                : `Сорилтын зорилт ${result.challenge.targetScore} оноо. Дахин оролдоод биелүүлээрэй — менежер тань үр дүнг харна.`}
            </div>
          )}
          <section className="rounded-2xl bg-[#17141f] p-4">
            <h2 className="mb-2 text-sm font-semibold text-[#b9a4ff]">Шалгуурууд</h2>
            <ul className="grid gap-2">
              {d.rubric.map((r) => (
                <li key={r.id} className="grid grid-cols-[1.5rem_1fr] gap-2 text-sm">
                  <span>{icon[r.result]}</span>
                  <span>
                    {r.label}
                    <span className="block text-xs text-[#a7a2c3]">{r.evidence}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-[#17141f] p-4">
              <h2 className="mb-2 text-sm font-semibold text-[#86efac]">Сайн хийсэн</h2>
              <ul className="list-disc space-y-1 pl-4 text-sm">{d.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <div className="rounded-2xl bg-[#17141f] p-4">
              <h2 className="mb-2 text-sm font-semibold text-[#fcd34d]">Сайжруулах</h2>
              <ul className="list-disc space-y-1 pl-4 text-sm">{d.improvements.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          </section>
          {d.betterLines.length > 0 && (
            <section className="rounded-2xl bg-[#17141f] p-4">
              <h2 className="mb-2 text-sm font-semibold text-[#b9a4ff]">Ингэж хэлбэл илүү</h2>
              <div className="grid gap-3">
                {d.betterLines.map((b) => (
                  <div key={b.said} className="border-l-2 border-[#8b5cf6] pl-3 text-sm">
                    <s className="text-[#a7a2c3]">{b.said}</s>
                    <p>→ {b.better}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {d.factErrors.length > 0 && (
            <section className="rounded-2xl bg-[#e11d48]/10 p-4">
              <h2 className="mb-2 text-sm font-semibold text-[#fda4af]">Буруу эсвэл баталгаагүй мэдээлэл</h2>
              <ul className="list-disc space-y-1 pl-4 text-sm">{d.factErrors.map((s) => <li key={s}>{s}</li>)}</ul>
            </section>
          )}
          <details className="rounded-2xl bg-[#17141f] p-4 text-sm">
            <summary className="cursor-pointer text-[#c9c4e0]">Ярианы тэмдэглэл</summary>
            <div className="mt-3 grid gap-2">
              {chat.filter((l) => l.role !== "sys").map((l, i) => (
                <p key={i} className={l.role === "me" ? "text-right" : ""}>
                  <span className="text-xs text-[#6f6990]">{fmt(l.t)} · {l.role === "me" ? "Та" : pack.personaName}</span>
                  <br />
                  {l.text}
                </p>
              ))}
            </div>
          </details>
          <div className="flex gap-3">
            <button onClick={() => window.location.reload()} className="flex-1 rounded-full bg-[#8b5cf6] px-5 py-3 text-sm font-semibold text-[#ffffff]">
              Дахин оролдох
            </button>
            <button onClick={finishToApp} className="flex-1 rounded-full bg-[#ffffff] px-5 py-3 text-sm font-semibold text-[#110f18]">
              Дуусгах
            </button>
          </div>
        </div>
      </main>
    );
  }

  const live = phase === "live";
  const emo = EMOTION_UI[emotion];
  const lastAi = [...chat].reverse().find((l) => l.role === "ai");

  return (
    <main className="fixed inset-0 z-50 flex h-dvh flex-col bg-[#09080f] text-[#ffffff]">
      <header className="flex items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={close} aria-label="Хаах" className="rounded-full bg-[#ffffff]/10 px-3 py-1.5 text-sm">
          ✕
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {pack.icon} {pack.title}
          </p>
          <p className="truncate text-xs text-[#a7a2c3]">
            {mode === "video" ? "🎥 Видео" : "📞 Аудио"} · {DIFFICULTY_LABEL[difficulty]}
            {challengeId ? " · 🏆 Сорилт" : ""}
          </p>
        </div>
        {source && (
          <span
            className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", source === "model" ? "bg-[#8b5cf6]/25 text-[#b9a4ff]" : "bg-[#ffffff]/10 text-[#a7a2c3]")}
            title={source === "model" ? "Манай fine-tuned загвар хариулж байна" : "Манай загвар унтарсан тул Claude орлож байна"}
          >
            {source === "model" ? "🧠 Манай загвар" : "Claude"}
          </span>
        )}
        {(live || phase === "grading") && <span className="font-mono text-sm tabular-nums text-[#c9c4e0]">{fmt(seconds)}</span>}
      </header>

      <div className="relative min-h-0 flex-1">
        {phase === "intro" && (
          <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto p-6 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#8b5cf6]/15 text-5xl">{pack.icon}</div>
            <h1 className="text-xl font-bold">{pack.title}</h1>
            <p className="max-w-md text-sm text-[#c9c4e0]">{pack.subtitle}</p>
            <p className="max-w-md rounded-2xl bg-[#17141f] p-4 text-left text-sm leading-relaxed text-[#e2def5]">{pack.brief}</p>
            {pack.draft && <p className="max-w-md text-xs text-[#fcd34d]">⚠️ Ноорог агуулга: мэргэжлийн байгууллагаар баталгаажуулна.</p>}
            {mode === "video" && !video && <p className="max-w-md text-xs text-[#fcd34d]">Видео аватар одоогоор тохируулагдаагүй тул дуугаар үргэлжилнэ.</p>}
            <p className="text-xs text-[#a7a2c3]">Товч дарахгүйгээр зүгээр л ярина. Чихэвч зүүвэл илүү найдвартай.</p>
            <button onClick={() => void start()} className="rounded-full bg-[#8b5cf6] px-8 py-3 text-base font-semibold text-[#ffffff]">
              {video ? "Эхлэх" : "Дуудлага эхлүүлэх"}
            </button>
          </div>
        )}

        {phase !== "intro" && video && avatarOn && (
          <AnamAvatar
            ref={avatarRef}
            sessionId=""
            name={pack.personaName}
            tokenUrl="/api/coach/avatar"
            tokenBody={{ packRef: pack.id, emotion: pack.openingEmotion }}
            emotion={pack.openingEmotion}
            autoStart
            onLive={() => liveResolve.current?.()}
            className="relative h-full w-full overflow-hidden bg-[#110f18]"
          />
        )}

        {phase !== "intro" && !video && (
          <div className="flex h-full flex-col items-center justify-center gap-5 bg-[radial-gradient(120%_90%_at_50%_0%,#3a2d7a_0%,#17132e_60%,#0d0b1a_100%)] p-6">
            <p className="text-sm text-[#ffffff]/70">{phase === "ringing" ? "Ирж буй дуудлага" : "Холбогдсон"}</p>
            <div
              className={cn(
                "flex h-36 w-36 items-center justify-center rounded-full bg-[#ffffff]/10 text-6xl transition",
                phase === "ringing" && "animate-bounce",
                speaking && "ring-4 ring-[#9b85ff]/80",
              )}
            >
              {phase === "ringing" ? "👤" : emo.emoji}
            </div>
            <p className="text-lg font-semibold">{pack.personaName}</p>
            {live && <span className="rounded-full bg-[#ffffff]/12 px-3 py-1 text-xs">{emo.label}</span>}
            {phase === "ringing" ? (
              <button onClick={() => void answer()} aria-label="Хариулах" className="h-20 w-20 rounded-full bg-[#16a35a] text-3xl shadow-lg">
                📞
              </button>
            ) : (
              <button onClick={hangUp} disabled={phase === "grading"} aria-label="Дуусгах" className="h-16 w-16 rounded-full bg-[#e11d48] text-2xl disabled:opacity-40">
                ✕
              </button>
            )}
          </div>
        )}

        {video && live && (
          <span className="absolute left-3 top-3 rounded-full bg-[#000000]/55 px-3 py-1 text-xs">
            {emo.emoji} {emo.label}
          </span>
        )}
        {phase === "connecting" && (
          <div className="absolute inset-0 flex items-center justify-center gap-3 bg-[#09080f]/70 text-sm text-[#c9c4e0]">
            <Spinner /> {pack.personaName} холбогдож байна…
          </div>
        )}
        {phase === "grading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#09080f]/85 p-6 text-center text-sm text-[#c9c4e0]">
            <Spinner /> AI сургагч таны яриаг дүгнэж байна… (10–30 сек)
          </div>
        )}
      </div>

      {(live || phase === "grading") && (
        <section className="max-h-[50%] overflow-y-auto rounded-t-3xl bg-[#17141f] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {!showChat && lastAi && <p className="mb-2 text-sm leading-snug text-[#e2def5]">«{lastAi.text}»</p>}
          {showChat && (
            <div className="mb-3 grid max-h-56 gap-2 overflow-y-auto text-sm">
              {chat.map((l, i) => (
                <p key={i} className={cn(l.role === "me" && "text-right text-[#b9a4ff]", l.role === "sys" && "text-center text-xs text-[#6f6990]")}>
                  {l.text}
                </p>
              ))}
              <div ref={chatEnd} />
            </div>
          )}
          <p className="mb-2 min-h-4 text-xs text-[#a7a2c3]">
            {listening && !recording ? "🎙️ " : ""}
            {status}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void toggleMic()}
              disabled={phase !== "live"}
              aria-label={recording ? "Илгээх" : "Товчоор ярих"}
              className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl disabled:opacity-40", recording ? "animate-pulse bg-[#e11d48]" : "bg-[#8b5cf6] text-[#ffffff]")}
            >
              {recording ? "■" : "🎤"}
            </button>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onFocus={() => callRef.current && (callRef.current.manual = true)}
              onBlur={() => callRef.current && (callRef.current.manual = false)}
              onKeyDown={(e) => e.key === "Enter" && sendTyped()}
              disabled={phase !== "live"}
              placeholder={pack.language === "en" ? "Type in English…" : "Эсвэл энд бичнэ үү…"}
              className="min-w-0 flex-1 rounded-full border border-[#352e4a] bg-[#1e1734] px-4 py-3 text-sm text-[#ffffff] placeholder:text-[#6f6990]"
            />
            <button onClick={() => setShowChat((v) => !v)} className="rounded-full border border-[#352e4a] px-3 py-3 text-xs">
              {showChat ? "Нуух" : "Яриа"}
            </button>
            {video && (
              <button onClick={hangUp} disabled={phase !== "live"} className="rounded-full bg-[#e11d48] px-4 py-3 text-xs font-semibold disabled:opacity-40">
                Дуусгах
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
