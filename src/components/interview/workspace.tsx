"use client";

import { AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react";
import { ClipboardList, Clock, Keyboard, MessageSquare, Mic, SendHorizontal, Stethoscope, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { t } from "@/i18n";
import { describeError, sessionBackend, type ConsultBackend } from "@/lib/api";
import { offlineBackend } from "@/lib/demo/offline";
import { useNow } from "@/lib/use-now";
import type { MessageView, ProviderBadge, SessionView, VoiceFeatures } from "@/lib/views";
import { useToast } from "../providers";
import { MoodMeter, PatientView, moodForCase } from "../patient/patient-view";
import { Badge, Button, cn } from "../ui";
import { ClinicalNotes } from "./clinical-notes";
import { DiagnosisDialog } from "./diagnosis-dialog";
import { VideoConsult } from "./video-consult";
import { VitalsMonitor } from "./vitals-monitor";
import { VoiceInput } from "./voice-input";

const MAX_CHARS = 500;
type Tab = "chat" | "patient" | "notes";

export function InterviewWorkspace({ initial, offlineCaseId, voice }: { initial: SessionView; offlineCaseId?: string; voice?: VoiceFeatures }) {
  // With a talking avatar configured, the consultation is a full-screen video call.
  if (voice?.avatar && !offlineCaseId) return <VideoConsult initial={initial} voice={voice} />;
  return <ConsultWorkspace initial={initial} offlineCaseId={offlineCaseId} voice={voice} />;
}

function ConsultWorkspace({ initial, offlineCaseId, voice }: { initial: SessionView; offlineCaseId?: string; voice?: VoiceFeatures }) {
  const router = useRouter();
  const toast = useToast();
  const backend: ConsultBackend = useMemo(() => (offlineCaseId ? offlineBackend(offlineCaseId) : sessionBackend(initial.id)), [offlineCaseId, initial.id]);
  const c = initial.case;
  const mood = useMemo(() => moodForCase(c), [c]);

  const [messages, setMessages] = useState<MessageView[]>(initial.messages);
  const [questionCount, setQuestionCount] = useState(initial.questionCount);
  const [provider, setProvider] = useState<ProviderBadge>(initial.provider);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [revealing, setRevealing] = useState<string | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [showDiagnosis, setShowDiagnosis] = useState(false);
  const [ending, setEnding] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const micLevel = useMotionValue(0);
  const audioLevel = useMotionValue(0);
  // Messages present on load appear without an entrance animation.
  const [seen] = useState(() => new Set(initial.messages.map((m) => m.id)));
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const limitReached = questionCount >= initial.maxQuestions;
  const speaking = revealing !== null || audioPlaying;

  // Keep the newest message in view, including while a reply is being revealed.
  useEffect(() => {
    const list = listRef.current;
    const content = contentRef.current;
    if (!list || !content) return;
    const observer = new ResizeObserver(() => list.scrollTo({ top: list.scrollHeight, behavior: "smooth" }));
    observer.observe(content);
    return () => observer.disconnect();
  }, [tab]);

  useEffect(() => () => audioRef.current?.pause(), []);

  async function speak(messageId: string) {
    const blob = await backend.replyAudio(messageId);
    if (!blob) return;
    const audio = new Audio(URL.createObjectURL(blob));
    audioRef.current?.pause();
    audioRef.current = audio;
    // Drive the mouth and the ring from the real audio loudness.
    let raf = 0;
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaElementSource(audio).connect(analyser);
      analyser.connect(ctx.destination);
      const data = new Uint8Array(analyser.fftSize);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        audioLevel.set(Math.min(1, Math.sqrt(sum / data.length) * 4));
        raf = requestAnimationFrame(loop);
      };
      audio.onplay = () => {
        setAudioPlaying(true);
        loop();
      };
      audio.onended = audio.onpause = () => {
        cancelAnimationFrame(raf);
        audioLevel.set(0);
        setAudioPlaying(false);
        void ctx.close();
      };
    } catch {
      audio.onplay = () => setAudioPlaying(true);
      audio.onended = audio.onpause = () => setAudioPlaying(false);
    }
    await audio.play().catch(() => setAudioPlaying(false));
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || pending || limitReached) return;
    setPending(true);
    const tempId = `pending-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: "student", content, createdAt: new Date().toISOString() }]);
    setDraft("");
    try {
      const result = await backend.ask(content);
      setMessages((prev) => [...prev.filter((m) => m.id !== tempId), ...result.messages]);
      setQuestionCount(result.questionCount);
      setProvider(result.provider);
      const reply = [...result.messages].reverse().find((m) => m.role === "patient");
      if (reply) {
        setRevealing(reply.id);
        if (voiceMode) void speak(reply.id);
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      // Keep whatever the student started typing while waiting.
      setDraft((d) => d || content);
      const { message, offline } = describeError(err);
      toast({ message, tone: "error", action: offline && !offlineCaseId ? { label: t.errors.useDemo, href: "/demo" } : undefined });
    } finally {
      setPending(false);
      if (!voiceMode) inputRef.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  async function endInterview() {
    if (!window.confirm(t.consult.endConfirm)) return;
    setEnding(true);
    try {
      await backend.end();
      router.push(backend.casesHref);
      router.refresh();
    } catch (err) {
      toast({ message: describeError(err).message, tone: "error" });
      setEnding(false);
    }
  }

  async function submitDiagnosis(input: { diagnosis: string; reasoning: string }) {
    await backend.submitDiagnosis(input);
    router.push(backend.resultsHref);
    router.refresh();
  }

  const patientCard = (
    <div className="flex flex-col items-center gap-4 text-center">
      <PatientView
        sex={c.patient.sex}
        age={c.patient.age}
        mood={mood}
        speaking={speaking}
        listening={listening}
        level={audioPlaying ? audioLevel : listening ? micLevel : undefined}
        respiratoryRate={c.initialVitals?.respiratoryRate}
        size="lg"
        className="mt-6"
      />
      <div>
        <p className="font-display text-xl font-bold">{c.patient.name}</p>
        <p className="text-sm text-muted">
          {t.cases.ageSex(c.patient.age, t.sex[c.patient.sex])}
          {c.patient.occupation && ` · ${c.patient.occupation.mn}`}
        </p>
      </div>
      <MoodMeter mood={mood} />
      <dl className="w-full space-y-2 text-left text-sm">
        <div className="rounded-xl bg-sunken px-3 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{t.consult.chiefComplaint}</dt>
          <dd className="mt-0.5 font-semibold">{c.chiefComplaint.mn}</dd>
        </div>
        <div className="rounded-xl bg-sunken px-3 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{t.consult.setting}</dt>
          <dd className="mt-0.5">{c.setting.mn}</dd>
        </div>
      </dl>
    </div>
  );

  return (
    <main className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-[1440px] flex-col lg:px-4 lg:pb-4">
      {/* Top bar */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 lg:border-0 lg:px-0 lg:py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-sm font-bold sm:text-base">{c.displayTitle.mn}</h1>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <Timer startedAt={initial.startedAt} />
            <span aria-hidden>·</span>
            <span className="tabular-nums">{t.consult.questionsUsed(questionCount, initial.maxQuestions)}</span>
            <span className="hidden sm:inline">
              {offlineCaseId ? (
                <Badge tone="amber">{t.consult.offlineBadge}</Badge>
              ) : provider.isDemo ? (
                <Badge tone="amber">{provider.label}</Badge>
              ) : (
                <Badge tone="brand">{t.consult.aiBadge(provider.label)}</Badge>
              )}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={endInterview} disabled={ending || pending}>
          <X size={15} aria-hidden />
          <span className="hidden sm:inline">{t.consult.endInterview}</span>
        </Button>
        <Button size="sm" onClick={() => setShowDiagnosis(true)} disabled={pending} className="sm:h-9 sm:px-4">
          <Stethoscope size={15} aria-hidden />
          {t.consult.submitDiagnosis}
        </Button>
      </div>

      {/* Mobile tabs */}
      <div role="tablist" className="flex border-b border-line px-2 lg:hidden">
        {(
          [
            ["chat", MessageSquare],
            ["patient", UserRound],
            ["notes", ClipboardList],
          ] as const
        ).map(([id, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn("relative flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-semibold", tab === id ? "text-accent" : "text-muted")}
          >
            <Icon size={15} aria-hidden />
            {t.consult.tabs[id]}
            {tab === id && <motion.span layoutId="consult-tab" className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
        {/* Patient + vitals */}
        <aside className={cn("min-h-0 space-y-4 overflow-y-auto p-4 lg:block lg:p-0", tab === "patient" ? "block" : "hidden")}>
          <div className="glass rounded-3xl p-5">{patientCard}</div>
          <VitalsMonitor vitals={c.initialVitals} />
        </aside>

        {/* Conversation */}
        <section aria-label={t.consult.tabs.chat} className={cn("glass min-h-0 flex-col lg:flex lg:rounded-3xl", tab === "chat" ? "flex" : "hidden", "rounded-none border-x-0 lg:border-x")}>
          {/* Mobile: the patient stays visible while chatting */}
          <div className="flex items-center gap-3 border-b border-line px-4 py-2 lg:hidden">
            <PatientView
              sex={c.patient.sex}
              age={c.patient.age}
              mood={mood}
              speaking={speaking}
              listening={listening}
              level={audioPlaying ? audioLevel : undefined}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {c.patient.name}, {c.patient.age}
              </p>
              <p className="truncate text-xs text-muted">{speaking ? t.consult.typing(c.patient.name) : c.chiefComplaint.mn}</p>
            </div>
            <VitalsMonitor vitals={c.initialVitals} compact />
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6" aria-live="polite" aria-relevant="additions">
            <div ref={contentRef} className="space-y-4">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  animate={!seen.has(m.id)}
                  reveal={m.id === revealing}
                  onRevealed={() => setRevealing((id) => (id === m.id ? null : id))}
                  patient={c.patient}
                  mood={mood}
                />
              ))}
              <AnimatePresence>
                {pending && (
                  <motion.div
                    key="typing"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    className="flex items-end gap-2"
                    role="status"
                    aria-label={t.consult.typing(c.patient.name)}
                  >
                    <PatientView sex={c.patient.sex} age={c.patient.age} mood={mood} speaking={false} size="sm" className="!h-8 !w-8" />
                    <span className="flex gap-1.5 rounded-2xl rounded-bl-md bg-sunken px-4 py-3.5">
                      <span className="typing-dot h-2 w-2 rounded-full bg-subtle" />
                      <span className="typing-dot h-2 w-2 rounded-full bg-subtle" />
                      <span className="typing-dot h-2 w-2 rounded-full bg-subtle" />
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Composer */}
          <form onSubmit={send} className="border-t border-line p-3 sm:p-4">
            {limitReached ? (
              <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">{t.consult.limitReached}</div>
            ) : (
              <>
                <AnimatePresence initial={false}>
                  {voiceMode && (
                    <motion.div
                      key="voice"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <VoiceInput
                        transcribe={backend.transcribe}
                        serverTranscription={Boolean(voice?.speechInput)}
                        level={micLevel}
                        onListeningChange={setListening}
                        disabled={pending}
                        onTranscript={(text) => {
                          setDraft((d) => (d ? `${d} ${text}` : text).slice(0, MAX_CHARS));
                          inputRef.current?.focus();
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => setVoiceMode((v) => !v)}
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line transition-colors",
                      voiceMode ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken hover:text-ink",
                    )}
                    aria-pressed={voiceMode}
                    aria-label={voiceMode ? t.consult.textMode : t.consult.voiceMode}
                    title={voiceMode ? t.consult.textMode : t.consult.voiceMode}
                  >
                    {voiceMode ? <Keyboard size={18} /> : <Mic size={18} />}
                  </button>
                  <label htmlFor="question" className="sr-only">
                    {t.consult.placeholder}
                  </label>
                  <textarea
                    id="question"
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder={t.consult.placeholder}
                    className="field-sizing-content max-h-36 min-h-11 flex-1 resize-none rounded-xl border border-line bg-surface-solid px-3.5 py-2.5 text-[15px] placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
                  />
                  <motion.button
                    type="submit"
                    whileTap={{ scale: 0.9 }}
                    disabled={pending || !draft.trim()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-sm transition-opacity disabled:opacity-40"
                    aria-label={t.consult.send}
                  >
                    <SendHorizontal size={18} />
                  </motion.button>
                </div>
                <p className="mt-1.5 hidden justify-between text-[11px] text-subtle sm:flex">
                  <span>{t.consult.keyboardHint}</span>
                  <span className="tabular-nums">
                    {draft.length}/{MAX_CHARS}
                  </span>
                </p>
              </>
            )}
          </form>
        </section>

        {/* Notes */}
        <aside className={cn("min-h-0 p-4 lg:block lg:p-0", tab === "notes" ? "block" : "hidden")}>
          <div className="glass flex h-full flex-col rounded-3xl p-4">
            <ClinicalNotes messages={messages} storageKey={`pq-notes:${initial.id}`} />
            <p className="mt-4 rounded-xl bg-accent-soft px-3 py-2 text-xs leading-relaxed text-accent">{t.consult.tips}</p>
          </div>
        </aside>
      </div>

      <DiagnosisDialog
        open={showDiagnosis}
        onClose={() => setShowDiagnosis(false)}
        questionCount={questionCount}
        confidenceKey={initial.id}
        onSubmit={submitDiagnosis}
      />
    </main>
  );
}

function Timer({ startedAt }: { startedAt: string }) {
  const now = useNow();
  let text = "--:--";
  if (now !== null) {
    const s = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    text = h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  return (
    <span className="flex items-center gap-1 font-semibold tabular-nums text-ink" aria-label={t.consult.timer}>
      <Clock size={12} className="text-accent" aria-hidden />
      {text}
    </span>
  );
}

interface BubbleProps {
  message: MessageView;
  animate: boolean;
  reveal: boolean;
  onRevealed: () => void;
  patient: SessionView["case"]["patient"];
  mood: ReturnType<typeof moodForCase>;
}

function MessageBubble({ message, animate, reveal, onRevealed, patient, mood }: BubbleProps) {
  const motionProps = animate
    ? { initial: { opacity: 0, y: 14, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { type: "spring" as const, stiffness: 420, damping: 34 } }
    : {};

  if (message.role === "narrator") {
    return (
      <motion.div {...motionProps} className="mx-auto max-w-xl rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          <Stethoscope size={13} aria-hidden />
          {t.consult.exam}
        </p>
        <p className="prose-mn whitespace-pre-line text-ink">{reveal ? <WordReveal text={message.content} onDone={onRevealed} /> : message.content}</p>
      </motion.div>
    );
  }
  const student = message.role === "student";
  return (
    <motion.div {...motionProps} className={cn("flex items-end gap-2", student && "justify-end")}>
      {!student && <PatientView sex={patient.sex} age={patient.age} mood={mood} speaking={false} size="sm" className="!h-8 !w-8" />}
      <p
        className={cn(
          "prose-mn max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-[15px] sm:max-w-[72%]",
          student ? "rounded-br-md bg-accent text-accent-ink" : "rounded-bl-md bg-sunken text-ink",
          message.id.startsWith("pending-") && "opacity-70",
        )}
      >
        <span className="sr-only">{student ? `${t.consult.you}: ` : `${t.consult.patient}: `}</span>
        {reveal ? <WordReveal text={message.content} onDone={onRevealed} /> : message.content}
      </p>
    </motion.div>
  );
}

/**
 * The API returns the whole reply at once; reveal it word by word so the
 * patient appears to speak (the avatar's mouth moves meanwhile).
 */
function WordReveal({ text, onDone }: { text: string; onDone: () => void }) {
  const reduce = useReducedMotion();
  const words = useMemo(() => text.split(/(\s+)/), [text]);
  const [count, setCount] = useState(reduce ? words.length : 0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (reduce) {
      done.current();
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i += 2; // word + following whitespace
      setCount(i);
      if (i >= words.length) {
        window.clearInterval(id);
        done.current();
      }
    }, 70);
    return () => window.clearInterval(id);
  }, [words, reduce]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.slice(0, count).join("")}
        {count < words.length && <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-current opacity-60" />}
      </span>
    </>
  );
}
