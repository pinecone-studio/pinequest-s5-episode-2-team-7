"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/fetcher";
import { AnamAvatar } from "../interview/anam-avatar";
import { CallControls } from "../call-controls";
import { MAX_RECORD_SECONDS, Recorder } from "../interview/recorder";
import type { AvatarHandle } from "../interview/simli-avatar";
import { Spinner, cn } from "../ui";
import { EXAM_ANSWERS_KEY } from "@/lib/quiz-client";

/**
 * «Шүүлэг» oral exam: a talking examiner (Anam avatar, male TTS voice) asks
 * the questions one by one and the student answers by voice (Chimege STT) or
 * by typing. The quiz comes from the Otech AI iOS app (injected as
 * `window.__OTOCH_QUIZ`) or from the web page /soril (sessionStorage); the
 * answers go back to whichever opened it, and that side grades them.
 */

interface ExamQuestion {
  id: string;
  kind: "open" | "choice" | "case";
  prompt: string;
  options: string[];
}

interface ExamQuiz {
  title: string;
  questions: ExamQuestion[];
}

type Phase = "intro" | "connecting" | "asking" | "answering" | "finished";

declare global {
  interface Window {
    __OTOCH_QUIZ?: ExamQuiz;
    webkit?: { messageHandlers?: { otoch?: { postMessage(message: unknown): void } } };
  }
}

/** The app's quiz, or (for testing in a browser) one saved as sessionStorage "otoch-quiz". */
function injectedQuiz(): ExamQuiz | null {
  if (!window.__OTOCH_QUIZ) {
    try {
      const saved = sessionStorage.getItem("otoch-quiz");
      if (saved) window.__OTOCH_QUIZ = JSON.parse(saved) as ExamQuiz;
    } catch {
      // No storage or bad JSON: no quiz.
    }
  }
  return window.__OTOCH_QUIZ ?? null;
}

/** Tell the iOS app (no-op in a normal browser). "text" = continue the same quiz in the app's typed mode. */
function toApp(message: { type: "answers"; answers: string[] } | { type: "text" }) {
  const app = window.webkit?.messageHandlers?.otoch;
  if (app) {
    app.postMessage(message);
    return;
  }
  // Opened from the web page /soril: hand the answers back through sessionStorage.
  if (message.type === "answers") sessionStorage.setItem(EXAM_ANSWERS_KEY, JSON.stringify(message.answers));
  // A full load: /soril reads the hand-off once on arrival.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/soril?oral=${message.type === "answers" ? "done" : "text"}`);
}

/** Speaking time of a 16 kHz PCM16 WAV in ms (44-byte header). */
function wavMs(wav: ArrayBuffer): number {
  return Math.max(0, wav.byteLength - 44) / 32;
}

function spokenQuestion(q: ExamQuestion, index: number, total: number): string {
  const head = index === 0 ? "Эхний асуулт." : index === total - 1 ? "Сүүлийн асуулт." : `${index + 1}-р асуулт.`;
  const options = q.kind === "choice" && q.options.length ? ` Сонголтууд: ${q.options.join(". ")}.` : "";
  return `${head} ${q.prompt}${options}`;
}

export function Examiner() {
  // Injected by the app before the page loads; never changes afterwards.
  const quiz = useSyncExternalStore(
    () => () => {},
    injectedQuiz,
    () => null,
  );
  const [phase, setPhase] = useState<Phase>("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarOn, setAvatarOn] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const avatarRef = useRef<AvatarHandle>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const speakTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const liveResolve = useRef<(() => void) | null>(null);
  const answersRef = useRef<string[]>([]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    return () => {
      clearTimeout(speakTimer.current);
      void recorderRef.current?.stop();
      audioRef.current?.pause();
    };
  }, []);

  const onLive = useCallback(() => liveResolve.current?.(), []);

  /** Say a line with the avatar (or plain audio when the video is unavailable); resolves when finished. */
  async function say(text: string): Promise<void> {
    setSpeaking(true);
    try {
      const response = await fetch("/api/quiz/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (!response.ok) throw new Error("tts");
      const wav = await response.arrayBuffer();
      const avatar = avatarRef.current;
      if (avatar?.ready) {
        avatar.speak(wav);
        await new Promise<void>((resolve) => (speakTimer.current = setTimeout(resolve, wavMs(wav) + 900)));
      } else {
        const audio = new Audio(URL.createObjectURL(new Blob([wav], { type: "audio/wav" })));
        audioRef.current = audio;
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          void audio.play().catch(() => resolve());
        });
      }
    } catch {
      // No voice: the question is on screen anyway.
    } finally {
      setSpeaking(false);
    }
  }

  async function ask(i: number, current: ExamQuiz) {
    setIndex(i);
    setPhase("asking");
    await say(spokenQuestion(current.questions[i], i, current.questions.length));
    setPhase("answering");
  }

  async function begin() {
    if (!quiz) return;
    setError(null);
    setAnswers(quiz.questions.map(() => ""));
    setPhase("connecting");
    // Ask for the microphone now, while the tap still counts as a user gesture; an
    // unanswered permission prompt must not hold up the exam (the mic button asks again).
    await Promise.race([
      navigator.mediaDevices
        ?.getUserMedia({ audio: true })
        .then((s) => s.getTracks().forEach((t) => t.stop()))
        .catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 8_000)),
    ]);
    setAvatarOn(true);
    // Wait for the video (max 12 s); without it the examiner talks as audio only.
    await new Promise<void>((resolve) => {
      liveResolve.current = resolve;
      setTimeout(resolve, 12_000);
    });
    liveResolve.current = null;
    setPhase("asking");
    await say(`Сайн байна уу. Би таны шалгагч багш. «${quiz.title}» сэдвээр ${quiz.questions.length} асуулт асууна. Хариултаа дуугаар хэлж эсвэл бичиж болно. Эхэлье.`);
    await ask(0, quiz);
  }

  async function transcribeInto(i: number, wav: Blob) {
    setTranscribing(true);
    try {
      const { text } = await apiFetch<{ text: string }>("/api/speech/transcribe", { method: "POST", body: wav, headers: { "content-type": "audio/wav" } });
      if (text.trim()) setAnswers((prev) => prev.map((a, j) => (j === i ? (a ? `${a} ${text.trim()}` : text.trim()) : a)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Яриаг таньж чадсангүй.");
    } finally {
      setTranscribing(false);
    }
  }

  /** Mic: first press records; the second press (or each 14 s limit) transcribes and appends. */
  async function toggleMic() {
    setError(null);
    if (recorderRef.current) {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      setRecording(false);
      await transcribeInto(index, await recorder.stop());
      return;
    }
    avatarRef.current?.interrupt();
    const startRecorder = async () => {
      const recorder = new Recorder();
      // Chimege takes 15 s at most: keep going in pieces until the student stops.
      recorder.onLimit = () => {
        if (recorderRef.current !== recorder) return;
        recorderRef.current = null;
        void recorder.stop().then(async (wav) => {
          void transcribeInto(index, wav);
          await startRecorder();
        });
      };
      await recorder.start();
      recorderRef.current = recorder;
    };
    try {
      await startRecorder();
      setRecording(true);
    } catch {
      setError("Микрофон ашиглах зөвшөөрөл алга. Тохиргооноос зөвшөөрнө үү.");
    }
  }

  async function next() {
    if (!quiz) return;
    if (recorderRef.current) await toggleMic();
    if (index < quiz.questions.length - 1) {
      await ask(index + 1, quiz);
      return;
    }
    setPhase("finished");
    await say("Баярлалаа. Таны хариултуудыг одоо шалгая.");
    toApp({ type: "answers", answers: answersRef.current });
  }

  if (!quiz) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-muted">
        Аман шалгалтыг «Сорил» хэсгээс эхлүүлнэ үү.
        <a href="/soril" className="rounded-full bg-[#8b5cf6] px-6 py-3 text-sm font-semibold text-[#ffffff]">
          Сорил руу очих
        </a>
      </main>
    );
  }

  const q = quiz.questions[index];
  const busy = speaking || transcribing || phase === "asking" || phase === "connecting" || phase === "finished";

  return (
    <main className="fixed inset-0 z-50 flex h-dvh flex-col bg-[#09080f] text-[#ffffff]">
      <div className="relative min-h-0 flex-1">
        {avatarOn ? (
          <AnamAvatar
            ref={avatarRef}
            sessionId=""
            name="Шалгагч багш"
            tokenUrl="/api/quiz/avatar"
            autoStart
            onLive={onLive}
            className="relative h-full w-full overflow-hidden bg-[#110f18]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#8b5cf6]/15 text-5xl">🎓</div>
            <h1 className="text-xl font-bold">Шалгагч багш</h1>
            <p className="max-w-sm text-sm text-[#c9c4e0]">
              «{quiz.title}» сэдвээр {quiz.questions.length} асуулт асууна. Хариултаа дуугаар хэлж эсвэл бичиж өгнө.
            </p>
            <button onClick={begin} className="rounded-full bg-[#8b5cf6] px-8 py-3 text-base font-semibold text-[#ffffff]">
              Шалгалт эхлэх
            </button>
          </div>
        )}
        <button
          onClick={() => toApp({ type: "text" })}
          className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-full bg-black/50 px-3 py-1.5 text-sm"
        >
          Бичгээр хариулах
        </button>
      </div>

      {phase !== "intro" && (
        <section className="max-h-[55%] overflow-y-auto rounded-t-3xl bg-[#17141f] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {phase === "connecting" ? (
            <div className="flex items-center gap-3 py-4 text-sm text-[#c9c4e0]">
              <Spinner /> Багш холбогдож байна…
            </div>
          ) : (
            <>
              <p className="mb-1 text-xs font-semibold text-[#b9a4ff]">
                Асуулт {index + 1} / {quiz.questions.length}
              </p>
              <p className="text-base font-semibold leading-snug">{q.prompt}</p>
              {q.kind === "choice" && (
                <div className="mt-3 grid gap-2">
                  {q.options.map((option) => (
                    <button
                      key={option}
                      disabled={phase !== "answering"}
                      onClick={() => setAnswers((prev) => prev.map((a, j) => (j === index ? option : a)))}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left text-sm",
                        answers[index] === option ? "border-[#8b5cf6] bg-[#8b5cf6]/20" : "border-[#352e4a] bg-[#1e1734]",
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
              {showChat ? (
                <>
                  {index > 0 && (
                    <div className="mt-3 grid max-h-40 gap-2 overflow-y-auto rounded-xl bg-[#110f18] p-3 text-xs">
                      {quiz.questions.slice(0, index).map((pq, j) => (
                        <div key={pq.id}>
                          <p className="text-[#a7a2c3]">
                            {j + 1}. {pq.prompt}
                          </p>
                          <p className="text-right text-[#b9a4ff]">{answers[j] || "—"}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={answers[index] ?? ""}
                    onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === index ? e.target.value : a)))}
                    disabled={phase !== "answering"}
                    aria-label="Хариулт"
                    placeholder={phase === "answering" ? "Хариултаа энд бичнэ үү…" : "Багш асууж байна…"}
                    rows={3}
                    className="mt-3 w-full resize-none rounded-xl border border-[#352e4a] bg-[#1e1734] p-3 text-sm text-[#ffffff] placeholder:text-[#6f6990]"
                  />
                </>
              ) : (
                answers[index] && <p className="mt-3 rounded-xl bg-[#1e1734] p-3 text-sm text-[#e2def5]">{answers[index]}</p>
              )}
              {error && <p className="mt-2 text-xs text-[#fda4af]">{error}</p>}
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => void say(spokenQuestion(q, index, quiz.questions.length))}
                  disabled={busy || recording}
                  className="rounded-full border border-[#352e4a] px-4 py-2.5 text-sm disabled:opacity-40"
                >
                  Дахин сонсох
                </button>
                <button
                  onClick={() => void next()}
                  disabled={busy}
                  className="ml-auto rounded-full bg-[#ffffff] px-5 py-2.5 text-sm font-semibold text-[#110f18] disabled:opacity-40"
                >
                  {index === quiz.questions.length - 1 ? "Дуусгах" : "Дараах"}
                </button>
              </div>
              <p className="mb-3 mt-2 min-h-4 text-center text-xs text-[#c9c4e0]">
                {transcribing
                  ? "Бичвэр болгож байна…"
                  : recording
                    ? `Сонсож байна… дуусаад микрофоноо унтраана уу (${MAX_RECORD_SECONDS} сек тутам хэсэглэн таньна).`
                    : phase === "answering"
                      ? "Микрофоноо асааж хариулна уу, эсвэл 💬 чатаар бичнэ үү."
                      : ""}
              </p>
              <CallControls
                micOn={recording}
                micBusy={transcribing}
                chatOpen={showChat}
                disabled={phase !== "answering"}
                onMic={() => void toggleMic()}
                onChat={() => setShowChat((v) => !v)}
              />
              {phase === "finished" && <p className="mt-2 text-xs text-[#c9c4e0]">Хариултыг шалгаж байна…</p>}
            </>
          )}
        </section>
      )}
    </main>
  );
}
