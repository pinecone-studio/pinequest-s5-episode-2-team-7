"use client";

import { AnimatePresence, motion, useReducedMotion, type MotionValue } from "motion/react";
import { Loader2, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { t } from "@/i18n";
import { describeError } from "@/lib/api";
import { MAX_RECORD_SECONDS, MicRecorder, readLevel } from "@/lib/audio/recorder";
import { useToast } from "../providers";
import { cn } from "../ui";

type State = "idle" | "recording" | "transcribing";

interface VoiceInputProps {
  transcribe: (wav: Blob) => Promise<string>;
  onTranscript: (text: string) => void;
  /** Mic loudness, shared with the avatar's listening ring. */
  level: MotionValue<number>;
  onListeningChange: (listening: boolean) => void;
  disabled?: boolean;
}

/** Big tap-to-talk mic with a live waveform and a 14 s countdown ring. */
export function VoiceInput({ transcribe, onTranscript, level, onListeningChange, disabled }: VoiceInputProps) {
  const toast = useToast();
  const reduce = useReducedMotion();
  const [state, setState] = useState<State>("idle");
  const recorder = useRef<MicRecorder | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const progress = useRef<SVGCircleElement>(null);
  const frame = useRef(0);
  const startedAt = useRef(0);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      recorder.current?.cancel();
    },
    [],
  );

  // Draw once the canvas has mounted.
  useEffect(() => {
    if (state === "recording") draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function draw() {
    const analyser = recorder.current?.analyser;
    const el = canvas.current;
    if (!analyser || !el) return;
    const ctx = el.getContext("2d");
    const data = new Uint8Array(analyser.fftSize);
    const ratio = window.devicePixelRatio || 1;
    el.width = el.clientWidth * ratio;
    el.height = el.clientHeight * ratio;
    const color = getComputedStyle(el).color;
    // Scrolling loudness history, newest on the right (voice-memo style).
    const bars = 48;
    const history = new Array<number>(bars).fill(0);
    let lastPush = 0;
    const loop = (now = performance.now()) => {
      if (!recorder.current?.analyser || !ctx) return;
      const current = readLevel(analyser, data);
      level.set(current);
      if (now - lastPush > 55) {
        history.shift();
        history.push(current);
        lastPush = now;
      }
      const { width, height } = el;
      ctx.clearRect(0, 0, width, height);
      const gap = 3 * ratio;
      const barWidth = (width - gap * (bars - 1)) / bars;
      ctx.fillStyle = color;
      history.forEach((value, b) => {
        const barHeight = Math.max(3 * ratio, value * height);
        ctx.beginPath();
        ctx.roundRect(b * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight, barWidth / 2);
        ctx.fill();
      });
      const elapsed = (now - startedAt.current) / 1000;
      progress.current?.setAttribute("stroke-dashoffset", String(1 - Math.min(1, elapsed / MAX_RECORD_SECONDS)));
      frame.current = requestAnimationFrame(loop);
    };
    loop();
  }

  async function start() {
    if (!MicRecorder.supported()) {
      toast({ message: t.errors.micUnsupported, tone: "error" });
      return;
    }
    const rec = new MicRecorder();
    try {
      await rec.start();
    } catch (error) {
      rec.cancel();
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      toast({ message: denied ? t.errors.micDenied : t.errors.micUnsupported, tone: "error" });
      return;
    }
    recorder.current = rec;
    rec.onLimit = () => void stop();
    startedAt.current = performance.now();
    setState("recording");
    onListeningChange(true);
  }

  async function stop() {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    cancelAnimationFrame(frame.current);
    level.set(0);
    onListeningChange(false);
    const wav = await rec.stop();
    if (!wav) {
      setState("idle");
      toast({ message: t.errors.sttEmpty, tone: "info" });
      return;
    }
    setState("transcribing");
    try {
      const text = (await transcribe(wav)).trim();
      if (text) onTranscript(text);
      else toast({ message: t.errors.sttEmpty, tone: "info" });
    } catch (error) {
      toast({ message: describeError(error).message, tone: "error" });
    } finally {
      setState("idle");
    }
  }

  const recording = state === "recording";
  const label = recording ? t.consult.micStop : state === "transcribing" ? t.consult.micTranscribing : t.consult.micStart;

  return (
    <div className="flex flex-col items-center gap-2 py-1">
      <div className="relative flex h-14 w-full max-w-md items-center justify-center">
        <AnimatePresence>
          {recording && (
            <motion.canvas
              ref={canvas}
              key="wave"
              initial={{ opacity: 0, scaleY: 0.2 }}
              animate={{ opacity: 1, scaleY: 1 }}
              exit={{ opacity: 0, scaleY: 0.2 }}
              className="absolute inset-0 h-full w-full text-sky-500 dark:text-sky-400"
              aria-hidden
            />
          )}
        </AnimatePresence>
        {!recording && <p className="px-4 text-center text-xs text-subtle">{state === "transcribing" ? t.consult.micTranscribing : t.consult.micHint}</p>}
      </div>

      <div className="relative">
        {recording && !reduce && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-sky-500/30"
            animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <svg viewBox="0 0 80 80" className="pointer-events-none absolute -inset-1.5 h-[calc(100%+12px)] w-[calc(100%+12px)] -rotate-90" aria-hidden>
          <circle
            ref={progress}
            cx="40"
            cy="40"
            r="38"
            fill="none"
            strokeWidth="3"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset="1"
            strokeLinecap="round"
            className={cn("stroke-sky-500 transition-opacity", recording ? "opacity-100" : "opacity-0")}
          />
        </svg>
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => (recording ? void stop() : void start())}
          disabled={disabled || state === "transcribing"}
          aria-pressed={recording}
          aria-label={label}
          title={label}
          className={cn(
            "relative flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition-colors disabled:opacity-50",
            recording ? "bg-sky-500 shadow-sky-500/40" : "bg-accent text-accent-ink shadow-brand-500/30",
          )}
        >
          {state === "transcribing" ? <Loader2 size={26} className="animate-spin" /> : recording ? <Square size={22} fill="currentColor" /> : <Mic size={28} />}
        </motion.button>
      </div>
      <p className="text-xs font-semibold text-muted" aria-live="polite">
        {recording ? t.consult.micRecording : label}
      </p>
    </div>
  );
}
