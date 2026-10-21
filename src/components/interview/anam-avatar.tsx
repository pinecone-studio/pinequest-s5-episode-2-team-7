"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { AgentAudioInputStream, AnamClient } from "@anam-ai/js-sdk";
import { apiFetch } from "@/lib/fetcher";
import { EMOTIONS, type EmotionId } from "@/lib/patient/emotions";
import { Button, Spinner } from "../ui";
import type { AvatarHandle } from "./simli-avatar";

type Status = "off" | "connecting" | "live" | "resting" | "error";

/** Anam starts rendering after it has buffered about this much audio. */
const ANAM_BUFFER_MS = 800;
/**
 * Anam bills every second a session is open, talking or not. After this long
 * without the patient speaking the session is closed ("resting") and opened
 * again as soon as the student talks or asks something.
 */
const IDLE_MS = 60_000;
/** A hidden tab (student switched away) rests the avatar sooner. */
const HIDDEN_MS = 15_000;

/**
 * Anam talking-head video of the patient (audio-passthrough mode): Anam
 * renders and lip-syncs the face to the PCM we stream — the patient's own
 * TTS voice — so the AI and voice stay ours. Same handle as SimliAvatar.
 */
export function AnamAvatar({
  sessionId,
  name,
  onSpeakingChange,
  emotion,
  className,
  ref,
}: {
  sessionId: string;
  name: string;
  onSpeakingChange?: (speaking: boolean) => void;
  /** Starting expression style (Anam Director Notes). */
  emotion?: EmotionId;
  /** Container classes; defaults to a square tile. */
  className?: string;
  ref?: Ref<AvatarHandle>;
}) {
  const videoId = `anam-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const clientRef = useRef<AnamClient | null>(null);
  const streamRef = useRef<AgentAudioInputStream | null>(null);
  const speakingUntil = useRef(0);
  const speakingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** True while we close the session ourselves, so CONNECTION_CLOSED is not a failure. */
  const closingRef = useRef(false);
  const statusRef = useRef<Status>("off");
  const [status, setStatusState] = useState<Status>("off");
  const [speaking, setSpeaking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function setStatus(next: Status) {
    statusRef.current = next;
    setStatusState(next);
  }

  function stopSession() {
    closingRef.current = true;
    clearTimeout(idleTimer.current);
    void clientRef.current?.stopStreaming();
    clientRef.current = null;
    streamRef.current = null;
  }

  /** (Re)arm the idle countdown; it never fires while the patient is still talking. */
  function armIdle(ms = IDLE_MS) {
    clearTimeout(idleTimer.current);
    const wait = Math.max(0, speakingUntil.current - Date.now()) + ms;
    idleTimer.current = setTimeout(() => {
      if (statusRef.current !== "live") return;
      stopSession();
      setStatus("resting");
    }, wait);
  }

  // Anam has no "finished talking" event in passthrough mode, so speaking
  // time is derived from the audio we sent (16 kHz PCM16 = 32 bytes per ms).
  function markSpeaking(pcmBytes: number) {
    const now = Date.now();
    const start = Math.max(now, speakingUntil.current);
    speakingUntil.current = start + pcmBytes / 32 + (start === now ? ANAM_BUFFER_MS : 0);
    setSpeaking(true);
    clearTimeout(speakingTimer.current);
    speakingTimer.current = setTimeout(() => setSpeaking(false), speakingUntil.current - now);
  }

  useImperativeHandle(
    ref,
    () => ({
      ready: status === "live",
      speak(wav: ArrayBuffer) {
        const stream = streamRef.current;
        if (!stream || status !== "live") return;
        const pcm = pcmFromWav(new Uint8Array(wav));
        // Small chunks, sent faster than real time, as Anam recommends.
        for (let at = 0; at < pcm.length; at += 6400) stream.sendAudioChunk(pcm.slice(at, at + 6400));
        stream.endSequence();
        markSpeaking(pcm.length);
        armIdle();
      },
      wake() {
        if (statusRef.current === "resting") void start();
        else if (statusRef.current === "live") armIdle();
      },
      interrupt() {
        if (status !== "live") return;
        clientRef.current?.interruptPersona();
        streamRef.current?.endSequence();
        speakingUntil.current = 0;
        clearTimeout(speakingTimer.current);
        setSpeaking(false);
      },
      setEmotion(next: EmotionId) {
        // Live facial cue (Cara 4 avatars); older models ignore it.
        if (status !== "live") return;
        try {
          clientRef.current?.sendDirectorNoteCue(EMOTIONS[next].anamCue);
        } catch (error) {
          console.warn("[avatar] emotion cue not sent", error); // cosmetic; the call goes on
        }
      },
    }),
    // No dependency list: wake() must see the latest emotion and helpers.
  );

  // End the Anam session whenever the call goes away — unmount, reload, tab
  // close or navigation. Free plans allow one live session, and a session
  // left open blocks the next call until it times out.
  useEffect(() => {
    const end = () => {
      clearTimeout(speakingTimer.current);
      stopSession();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && statusRef.current === "live") armIdle(HIDDEN_MS);
      else if (document.visibilityState === "visible" && statusRef.current === "live") armIdle();
    };
    window.addEventListener("pagehide", end);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", end);
      document.removeEventListener("visibilitychange", onVisibility);
      end();
    };
    // The helpers only touch refs; run once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => onSpeakingChange?.(speaking), [speaking, onSpeakingChange]);

  async function start() {
    if (statusRef.current === "connecting") return;
    setStatus("connecting");
    setFailure(null);
    closingRef.current = false;
    try {
      const [{ createClient, AnamEvent }, { sessionToken, provider }] = await Promise.all([
        import("@anam-ai/js-sdk"),
        apiFetch<{ sessionToken: string; provider: string }>(`/api/sessions/${sessionId}/avatar`, { method: "POST", json: { emotion } }),
      ]);
      if (provider !== "anam") throw new Error("Аватарын тохиргоо өөрчлөгдсөн байна. Хуудсаа дахин ачаална уу.");
      // Our own microphone handling (Chimege STT) stays in charge.
      const client = createClient(sessionToken, { disableInputAudio: true });
      clientRef.current = client;
      // Anam ends sessions at the plan's length limit; rest instead of
      // failing, and the next question opens a fresh session.
      client.addListener(AnamEvent.CONNECTION_CLOSED, () => {
        if (clientRef.current !== client) return;
        clientRef.current = null;
        streamRef.current = null;
        clearTimeout(idleTimer.current);
        if (!closingRef.current && statusRef.current === "live") setStatus("resting");
      });
      await client.streamToVideoElement(videoId);
      streamRef.current = client.createAgentAudioInputStream({ encoding: "pcm_s16le", sampleRate: 16_000, channels: 1 });
      setStatus("live");
      armIdle();
    } catch (error) {
      console.error("[avatar] Anam failed to start", error);
      const message = error instanceof Error ? error.message : String(error);
      setFailure(
        /concurrency/i.test(message)
          ? "Өөр цонхонд нээлттэй видео дуудлага байна (Anam нэг дор нэг дуудлага зөвшөөрдөг). Бусад цонхыг хаагаад 1 минутын дараа дахин оролдоно уу."
          : /usage limit/i.test(message)
            ? "Anam-ийн сарын видео минут дууссан. Дуудлага дуу, хадмалаараа үргэлжилнэ; видеог дараа сард эсвэл төлбөртэй эрхээр сэргээнэ."
            : message,
      );
      stopSession();
      setStatus("error");
    }
  }

  return (
    <div className={className ?? "relative aspect-square w-full overflow-hidden rounded-xl bg-slate-900"}>
      <video id={videoId} autoPlay playsInline className="h-full w-full object-cover" aria-label={`${name} — видео аватар`} />
      {status !== "live" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-[#e2e8f0]">
          {status === "connecting" ? (
            <>
              <Spinner />
              <span>Аватар холбогдож байна…</span>
            </>
          ) : status === "resting" ? (
            <>
              <span>Видео аватар түр амарч байна (минут хэмнэхийн тулд).</span>
              <span className="text-xs text-[#cbd5e1]">Асуулт асуухад дахин асна.</span>
              <Button size="sm" onClick={start}>
                Одоо асаах
              </Button>
            </>
          ) : (
            <>
              {status === "error" && <span>Аватар холбогдсонгүй.{failure && <span className="mx-auto mt-1 block max-w-md text-xs text-[#cbd5e1]">{failure}</span>}</span>}
              <Button size="sm" onClick={start}>
                {status === "error" ? "Дахин оролдох" : "Видео аватар асаах"}
              </Button>
            </>
          )}
        </div>
      )}
      {status === "live" && speaking && <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">ярьж байна</span>}
    </div>
  );
}

function pcmFromWav(wav: Uint8Array): Uint8Array {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let at = 12;
  while (at + 8 <= wav.length) {
    const id = String.fromCharCode(...wav.subarray(at, at + 4));
    const size = view.getUint32(at + 4, true);
    if (id === "data") return wav.subarray(at + 8, Math.min(at + 8 + size, wav.length));
    at += 8 + size + (size % 2);
  }
  return new Uint8Array();
}
