"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { apiFetch } from "@/lib/fetcher";
import { SEX_LABELS } from "@/lib/i18n";
import type { MessageView, ProviderBadge, SessionView, VoiceFeatures } from "@/lib/views";
import { Alert, Badge, Button, Card, Spinner, cn } from "../ui";
import { DiagnosisDialog } from "./diagnosis-dialog";
import { PatientAvatar } from "./patient-avatar";
import { MAX_RECORD_SECONDS, Recorder } from "./recorder";
import { SimliAvatar, type AvatarHandle } from "./simli-avatar";

const MAX_CHARS = 500;

const TIPS = [
  "Нээлттэй асуултаар эхэлж, дараа нь нарийвчилж асуу.",
  "Өвдөлтийг эхлэл, байршил, шинж, дамжилт, хүч, хугацаагаар тодруул.",
  "Хавсарсан шинж, чухал сөрөг шинжийг мартуузай.",
  "Өмнөх өвчин, эм, харшил, удамшил, нийгмийн түүхийг асуу.",
];

const NO_VOICE: VoiceFeatures = { speechInput: false, speechOutput: false, avatar: false };

export function InterviewWorkspace({ initial, voice = NO_VOICE }: { initial: SessionView; voice?: VoiceFeatures }) {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageView[]>(initial.messages);
  const [questionCount, setQuestionCount] = useState(initial.questionCount);
  const [provider, setProvider] = useState(initial.provider);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiagnosis, setShowDiagnosis] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(voice.speechOutput);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<Recorder | null>(null);
  const avatarRef = useRef<AvatarHandle>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const c = initial.case;
  const limitReached = questionCount >= initial.maxQuestions;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  // Release the microphone if the page is left while recording.
  useEffect(() => () => void recorderRef.current?.stop(), []);

  /** Speak one patient reply: through the video avatar when it is live, otherwise as plain audio. */
  async function playReply(messageId: string) {
    try {
      const response = await fetch(`/api/sessions/${initial.id}/messages/${messageId}/audio`);
      if (!response.ok) throw new Error();
      const wav = await response.arrayBuffer();
      if (avatarRef.current?.ready) avatarRef.current.speak(wav);
      else await new Audio(URL.createObjectURL(new Blob([wav], { type: "audio/wav" }))).play();
    } catch {
      setError("Хариултыг дуугаар тоглуулж чадсангүй.");
    }
  }

  /** Mic button: first press records, second press (or the time limit) transcribes into the input. */
  async function toggleRecording() {
    if (!recorderRef.current) {
      const recorder = new Recorder();
      try {
        await recorder.start();
      } catch {
        setError("Микрофон нээгдсэнгүй. Хөтчийн зөвшөөрлийг шалгана уу.");
        return;
      }
      recorder.onLimit = () => void toggleRecording();
      recorderRef.current = recorder;
      setRecording(true);
      setError(null);
      return;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    setTranscribing(true);
    try {
      const wav = await recorder.stop();
      const { text } = await apiFetch<{ text: string }>("/api/speech/transcribe", { method: "POST", body: wav, headers: { "content-type": "audio/wav" } });
      if (!text) setError("Үг танигдсангүй. Дахин ярина уу.");
      else setDraft((prev) => (prev ? `${prev} ${text}` : text).slice(0, MAX_CHARS));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Яриа танигдсангүй.");
    } finally {
      setTranscribing(false);
      inputRef.current?.focus();
    }
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || pending || limitReached) return;
    setPending(true);
    setError(null);
    const tempId = `pending-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: "student", content, createdAt: new Date().toISOString() }]);
    setDraft("");
    try {
      const result = await apiFetch<{ messages: MessageView[]; questionCount: number; provider: ProviderBadge }>(`/api/sessions/${initial.id}/messages`, {
        method: "POST",
        json: { content },
      });
      setMessages((prev) => [...prev.filter((m) => m.id !== tempId), ...result.messages]);
      setQuestionCount(result.questionCount);
      setProvider(result.provider);
      const reply = result.messages.find((m) => m.role === "patient");
      if (reply && speakReplies) void playReply(reply.id);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(content);
      setError(err instanceof Error ? err.message : "Алдаа гарлаа.");
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  async function endInterview() {
    if (!window.confirm("Оношгүйгээр ярилцлагыг зогсоох уу? Үнэлгээ хийгдэхгүй.")) return;
    setEnding(true);
    try {
      await apiFetch(`/api/sessions/${initial.id}/end`, { method: "POST" });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Алдаа гарлаа.");
      setEnding(false);
    }
  }

  const patientPanel = (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <PatientAvatar sex={c.patient.sex} age={c.patient.age} size="lg" />
        <div>
          <p className="text-lg font-semibold leading-tight">{c.patient.name}</p>
          <p className="text-sm text-slate-500">
            {c.patient.age} нас · {SEX_LABELS[c.patient.sex]}
            {c.patient.occupation && ` · ${c.patient.occupation.mn}`}
          </p>
        </div>
      </div>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Үндсэн зовиур</dt>
          <dd className="mt-0.5 font-medium">{c.chiefComplaint.mn}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Орчин</dt>
          <dd className="mt-0.5">{c.setting.mn}</dd>
        </div>
        {c.initialVitals && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Амин үзүүлэлт</dt>
            <dd className="mt-1 grid grid-cols-2 gap-1.5 text-xs">
              {c.initialVitals.bloodPressure && <Vital label="АД" value={c.initialVitals.bloodPressure} />}
              {c.initialVitals.heartRate && <Vital label="Пульс" value={`${c.initialVitals.heartRate}/мин`} />}
              {c.initialVitals.respiratoryRate && <Vital label="Амьсгал" value={`${c.initialVitals.respiratoryRate}/мин`} />}
              {c.initialVitals.temperatureC && <Vital label="Халуун" value={`${c.initialVitals.temperatureC}°C`} />}
              {c.initialVitals.spo2 && <Vital label="SpO₂" value={`${c.initialVitals.spo2}%`} />}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Төлөв</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="emerald">Ярилцлага явагдаж байна</Badge>
            <Badge>
              {questionCount}/{initial.maxQuestions} асуулт
            </Badge>
            {provider.isDemo ? (
              <Badge tone="amber">{provider.label}</Badge>
            ) : (
              <Badge tone="sky">AI: {provider.label}</Badge>
            )}
          </dd>
        </div>
        {voice.speechOutput && (
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={speakReplies} onChange={(e) => setSpeakReplies(e.target.checked)} className="h-4 w-4 accent-brand-600" />
              Өвчтөний хариуг чангаар унших
            </label>
          </div>
        )}
      </dl>
      <div className="rounded-xl bg-slate-50 p-3">
        <p className="mb-1.5 text-xs font-semibold text-slate-600">Асуумжийн зөвлөмж</p>
        <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
          {TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-0 py-0 md:flex-row md:px-4 md:py-6">
      {/* Patient panel: sidebar on desktop, collapsible summary on mobile */}
      <aside className="md:w-80 md:shrink-0">
        <Card className="hidden p-5 md:sticky md:top-20 md:block">{patientPanel}</Card>
        <div className="border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button type="button" className="flex w-full items-center gap-3 text-left" aria-expanded={showInfo} onClick={() => setShowInfo((v) => !v)}>
            <PatientAvatar sex={c.patient.sex} age={c.patient.age} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {c.patient.name}, {c.patient.age} нас
              </span>
              <span className="block truncate text-xs text-slate-500">{c.chiefComplaint.mn}</span>
            </span>
            <span className="text-xs text-brand-700">{showInfo ? "Хураах" : "Дэлгэрэнгүй"}</span>
          </button>
          {showInfo && <div className="mt-4">{patientPanel}</div>}
        </div>
      </aside>

      <section aria-label="Ярилцлага" className="flex h-[calc(100dvh-7.5rem)] min-h-[420px] flex-1 flex-col bg-white md:h-[calc(100dvh-6.5rem)] md:rounded-2xl md:border md:border-slate-200 md:shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h1 className="truncate text-sm font-semibold text-slate-700">{c.displayTitle.mn}</h1>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" onClick={endInterview} disabled={ending || pending}>
              Зогсоох
            </Button>
            <Button size="sm" onClick={() => setShowDiagnosis(true)} disabled={pending}>
              Онош илгээх
            </Button>
          </div>
        </div>

        {voice.avatar && (
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="mx-auto w-40 sm:w-56">
              <SimliAvatar ref={avatarRef} sessionId={initial.id} name={c.patient.name} />
            </div>
          </div>
        )}

        <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5" aria-live="polite" aria-relevant="additions">
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              sex={c.patient.sex}
              age={c.patient.age}
              onPlay={voice.speechOutput && m.role === "patient" && !m.id.startsWith("pending-") ? () => void playReply(m.id) : undefined}
            />
          ))}
          {pending && (
            <div className="flex items-end gap-2" role="status" aria-label={`${c.patient.name} хариулж байна`}>
              <PatientAvatar sex={c.patient.sex} age={c.patient.age} size="sm" />
              <span className="flex gap-1 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3">
                <span className="typing-dot h-2 w-2 rounded-full bg-slate-400" />
                <span className="typing-dot h-2 w-2 rounded-full bg-slate-400" />
                <span className="typing-dot h-2 w-2 rounded-full bg-slate-400" />
              </span>
            </div>
          )}
        </div>

        <form onSubmit={send} className="border-t border-slate-100 p-3 sm:p-4">
          {error && (
            <div className="mb-3">
              <Alert>{error}</Alert>
            </div>
          )}
          {limitReached ? (
            <Alert tone="amber">Асуултын дээд хязгаарт хүрлээ. Оношоо илгээнэ үү.</Alert>
          ) : (
            <div className="flex items-end gap-2">
              <label htmlFor="question" className="sr-only">
                Өвчтөнд асуулт
              </label>
              <textarea
                id="question"
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={recording ? "Сонсож байна… дахин дарж дуусгана" : transcribing ? "Яриаг бичвэр болгож байна…" : "Асуултаа бичнэ үү…"}
                className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-slate-300 px-3.5 py-2.5 text-[15px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                disabled={pending || recording || transcribing}
                autoFocus
              />
              {voice.speechInput && (
                <Button
                  type="button"
                  variant={recording ? "primary" : "ghost"}
                  className={cn("h-11 shrink-0", recording && "bg-red-600 hover:bg-red-700")}
                  onClick={() => void toggleRecording()}
                  disabled={pending || transcribing}
                  aria-pressed={recording}
                  aria-label={recording ? "Бичлэгийг дуусгах" : "Дуугаар асуух"}
                  title={`Дуугаар асуух (${MAX_RECORD_SECONDS} сек хүртэл)`}
                >
                  {transcribing ? <Spinner /> : recording ? <span aria-hidden className="block h-3.5 w-3.5 rounded-sm bg-white" /> : <MicIcon />}
                </Button>
              )}
              <Button type="submit" className="h-11 shrink-0" disabled={pending || !draft.trim()}>
                {pending ? <Spinner /> : "Илгээх"}
              </Button>
            </div>
          )}
          <p className="mt-1.5 flex justify-between text-[11px] text-slate-400">
            <span className="hidden sm:inline">Enter — илгээх · Shift+Enter — шинэ мөр</span>
            <span className="sm:hidden" />
            <span>
              {draft.length}/{MAX_CHARS}
            </span>
          </p>
        </form>
      </section>

      <DiagnosisDialog open={showDiagnosis} onClose={() => setShowDiagnosis(false)} sessionId={initial.id} questionCount={questionCount} />
    </main>
  );
}

function MicIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
    </svg>
  );
}

function Vital({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-lg bg-slate-50 px-2 py-1">
      <span className="text-slate-400">{label}</span> <span className="font-medium">{value}</span>
    </span>
  );
}

function MessageBubble({ message, sex, age, onPlay }: { message: MessageView; sex: "male" | "female"; age: number; onPlay?: () => void }) {
  if (message.role === "narrator") {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-700">Үзлэгийн тэмдэглэл</p>
        <p className="prose-mn whitespace-pre-line">{message.content}</p>
      </div>
    );
  }
  const student = message.role === "student";
  return (
    <div className={cn("flex items-end gap-2", student && "justify-end")}>
      {!student && <PatientAvatar sex={sex} age={age} size="sm" />}
      <p
        className={cn(
          "prose-mn max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-[15px] sm:max-w-[75%]",
          student ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-slate-100 text-slate-800",
          message.id.startsWith("pending-") && "opacity-70",
        )}
      >
        <span className="sr-only">{student ? "Та: " : "Өвчтөн: "}</span>
        {message.content}
      </p>
      {onPlay && (
        <button type="button" onClick={onPlay} className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Чангаар сонсох" title="Чангаар сонсох">
          🔊
        </button>
      )}
    </div>
  );
}
