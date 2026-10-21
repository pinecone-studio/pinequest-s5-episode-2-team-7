"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { EMOTION_IDS, EMOTIONS, type EmotionId } from "@/lib/patient/emotions";
import type { PublicCase } from "@/lib/cases/public";
import { cn } from "../ui";

/**
 * FaceTime-style video call with the patient: the avatar fills the screen,
 * the latest reply is shown as captions, and the text chat is a drawer that
 * stays closed until the student opens it.
 */
export function CallView({
  patientCase: c,
  avatar,
  chat,
  status,
  listening,
  studentSpeaking,
  canListen,
  onToggleListen,
  speakReplies,
  onToggleSpeak,
  emotion,
  onEmotion,
  caption,
  messageCount,
  onDiagnosis,
  onEnd,
  busy,
}: {
  patientCase: PublicCase;
  avatar: ReactNode;
  chat: ReactNode;
  status: string;
  listening: boolean;
  studentSpeaking: boolean;
  canListen: boolean;
  onToggleListen: () => void;
  speakReplies: boolean;
  onToggleSpeak: () => void;
  emotion: EmotionId;
  onEmotion: (emotion: EmotionId) => void;
  caption: string | null;
  messageCount: number;
  onDiagnosis: () => void;
  onEnd: () => void;
  busy: boolean;
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [seen, setSeen] = useState(messageCount);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);
  const unread = chatOpen ? 0 : Math.max(0, messageCount - seen);

  useEffect(() => {
    started.current = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  // Opening or closing the chat marks everything so far as read.
  function toggleChat(open: boolean) {
    setSeen(messageCount);
    setChatOpen(open);
  }

  const mood = EMOTIONS[emotion];
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <main className="relative flex h-[calc(100dvh-3.5rem)] w-full flex-1 overflow-hidden bg-slate-950 text-white">
      <div className="relative min-w-0 flex-1">
        {/* The patient, full screen */}
        <div className="absolute inset-0">{avatar}</div>

        {/* Top bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-4 sm:p-5">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">
              {c.patient.name}, {c.patient.age}
            </p>
            <p className="truncate text-sm text-white/70">{c.chiefComplaint.mn}</p>
            <p className="mt-1 flex items-center gap-2 text-xs text-white/80">
              <span className="font-mono">{clock}</span>
              <span aria-hidden>·</span>
              <span>
                {mood.emoji} {mood.label}
              </span>
            </p>
          </div>
          {c.initialVitals && <VitalsMonitor vitals={c.initialVitals} />}
        </div>

        {/* Captions, status and controls stacked so they never overlap on narrow screens */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-3 pb-5 pt-10">
          {captions && caption && (
            <p className="pointer-events-none max-h-28 max-w-2xl overflow-hidden rounded-xl bg-black/65 px-4 py-2 text-center text-base leading-snug sm:text-lg">{caption}</p>
          )}
          <p className="flex items-center gap-2 text-sm text-white/85" role="status">
            <span className={cn("h-2 w-2 rounded-full", studentSpeaking ? "animate-pulse bg-red-500" : listening ? "bg-emerald-400" : "bg-white/40")} />
            {status}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {canListen && (
              <RoundButton label={listening ? "Микрофон унтраах" : "Ярьж эхлэх"} active={listening} onClick={onToggleListen} big>
                <MicIcon off={!listening} />
              </RoundButton>
            )}
            <RoundButton label={speakReplies ? "Дууг хаах" : "Дууг нээх"} active={speakReplies} onClick={onToggleSpeak}>
              {speakReplies ? "🔊" : "🔇"}
            </RoundButton>
            <div className="relative">
              <RoundButton label="Өвчтөний сэтгэл хөдлөл" active={moodOpen} onClick={() => setMoodOpen((v) => !v)}>
                {mood.emoji}
              </RoundButton>
              {moodOpen && (
                <div className="absolute bottom-14 left-1/2 z-10 w-52 -translate-x-1/2 rounded-2xl bg-slate-900/95 p-1.5 shadow-xl ring-1 ring-white/10">
                  {EMOTION_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        onEmotion(id);
                        setMoodOpen(false);
                      }}
                      className={cn("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10", id === emotion && "bg-white/15")}
                    >
                      <span>{EMOTIONS[id].emoji}</span>
                      {EMOTIONS[id].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <RoundButton label={captions ? "Хадмал нуух" : "Хадмал харуулах"} active={captions} onClick={() => setCaptions((v) => !v)}>
              CC
            </RoundButton>
            <div className="relative">
              <RoundButton label="Чат" active={chatOpen} onClick={() => toggleChat(!chatOpen)}>
                💬
              </RoundButton>
              {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[11px] font-semibold">{unread}</span>}
            </div>
            <button type="button" onClick={onDiagnosis} disabled={busy} className="h-12 rounded-full bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-white/90 disabled:opacity-50">
              Онош илгээх
            </button>
            <RoundButton label="Дуудлага дуусгах" onClick={onEnd} danger>
              <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 rotate-[135deg]" fill="currentColor">
                <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
              </svg>
            </RoundButton>
          </div>
        </div>
      </div>

      {/* Chat drawer (closed by default) */}
      <aside
        aria-label="Чат"
        className={cn(
          "absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col bg-white text-slate-900 shadow-2xl transition-transform duration-200 sm:relative sm:shadow-none",
          chatOpen ? "translate-x-0" : "pointer-events-none translate-x-full sm:hidden",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold">Ярилцлагын тэмдэглэл</p>
          <button type="button" onClick={() => toggleChat(false)} className="rounded-full px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label="Чатыг хаах">
            ✕
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{chat}</div>
      </aside>
    </main>
  );
}

function RoundButton({
  label,
  onClick,
  active,
  danger,
  big,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  big?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-lg font-semibold backdrop-blur transition",
        big ? "h-14 w-14" : "h-12 w-12",
        danger ? "bg-red-600 hover:bg-red-500" : active ? "bg-white text-slate-900" : "bg-white/15 hover:bg-white/25",
      )}
    >
      {children}
    </button>
  );
}

function MicIcon({ off }: { off: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

/** Bedside-monitor style vitals with an optional heartbeat beep, for an emergency-room feel. */
function VitalsMonitor({ vitals }: { vitals: NonNullable<PublicCase["initialVitals"]> }) {
  const [beep, setBeep] = useState(false);
  const hr = vitals.heartRate;

  useEffect(() => {
    if (!beep || !hr) return;
    const ctx = new AudioContext();
    const tick = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    };
    const timer = setInterval(tick, 60_000 / hr);
    return () => {
      clearInterval(timer);
      void ctx.close();
    };
  }, [beep, hr]);

  const cell = (label: string, value: string | number | undefined, color: string) =>
    value !== undefined && (
      <div>
        <p className="text-[10px] uppercase tracking-wide text-white/50">{label}</p>
        <p className={cn("font-mono text-xl font-bold leading-none", color)}>{value}</p>
      </div>
    );

  return (
    <div className="pointer-events-auto rounded-xl bg-black/70 p-3 ring-1 ring-white/10">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {cell("ЗЦ", hr, "text-emerald-400")}
        {cell("SpO₂", vitals.spo2 !== undefined ? `${vitals.spo2}%` : undefined, "text-sky-400")}
        {cell("АД", vitals.bloodPressure, "text-red-400")}
        {cell("Халуун", vitals.temperatureC !== undefined ? `${vitals.temperatureC}°` : undefined, "text-amber-300")}
      </div>
      {hr && (
        <button type="button" onClick={() => setBeep((v) => !v)} className="mt-2 w-full rounded-lg bg-white/10 px-2 py-1 text-[11px] text-white/80 hover:bg-white/20">
          {beep ? "♥ Мониторын дуу: асаалттай" : "♡ Мониторын дуу"}
        </button>
      )}
    </div>
  );
}
