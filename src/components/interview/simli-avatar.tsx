"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
// simli-client 3.0.2's index.js requires "./Client" but ships "client.js";
// importing the real file directly works on case-sensitive bundlers (Turbopack).
import type { SimliClient } from "simli-client/dist/client";
import { apiFetch } from "@/lib/fetcher";
import type { EmotionId } from "@/lib/patient/emotions";
import { Button, Spinner } from "../ui";

export interface AvatarHandle {
  /** True once the video avatar is live and can lip-sync. */
  ready: boolean;
  /** Lip-sync a 16 kHz PCM16 WAV (the patient's Chimege voice). */
  speak(wav: ArrayBuffer): void;
  /** Stop talking now and drop queued audio (the student interrupted). */
  interrupt(): void;
  /** Change the facial expression (no-op where the service cannot). */
  setEmotion(emotion: EmotionId): void;
  /**
   * Optional: lip-sync audio as it arrives — raw 16 kHz PCM16 pieces of one
   * utterance, `last` on the final call — instead of a whole WAV.
   */
  speakPcm?(pcm: Uint8Array, last: boolean): void;
  /** The student is about to talk or ask: reopen a resting video session. */
  wake?(): void;
}

type Status = "off" | "connecting" | "live" | "error";

/**
 * Simli talking-head video of the patient. Started on demand (it is billed
 * per minute) and stopped when the interview page unmounts.
 */
export function SimliAvatar({
  sessionId,
  name,
  onSpeakingChange,
  className,
  ref,
}: {
  sessionId: string;
  name: string;
  onSpeakingChange?: (speaking: boolean) => void;
  /** Container classes; defaults to a square tile. */
  className?: string;
  ref?: Ref<AvatarHandle>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clientRef = useRef<SimliClient | null>(null);
  const [status, setStatus] = useState<Status>("off");
  const [speaking, setSpeaking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      ready: status === "live",
      speak(wav: ArrayBuffer) {
        const client = clientRef.current;
        if (!client || status !== "live") return;
        const pcm = pcmFromWav(new Uint8Array(wav));
        // 0.2 s chunks; Simli queues and plays them in order.
        for (let at = 0; at < pcm.length; at += 6400) client.sendAudioData(pcm.subarray(at, at + 6400));
      },
      interrupt() {
        if (status === "live") clientRef.current?.ClearBuffer();
      },
      setEmotion() {
        // Simli faces have no expression control.
      },
    }),
    [status],
  );

  // Close the Simli session on unmount and when the tab is closed or reloaded.
  useEffect(() => {
    const end = () => {
      void clientRef.current?.stop();
      clientRef.current = null;
    };
    window.addEventListener("pagehide", end);
    return () => {
      window.removeEventListener("pagehide", end);
      end();
    };
  }, []);
  useEffect(() => onSpeakingChange?.(speaking), [speaking, onSpeakingChange]);

  async function start() {
    if (!videoRef.current || !audioRef.current) return;
    setStatus("connecting");
    setFailure(null);
    try {
      const [{ SimliClient, LogLevel }, { sessionToken, provider }] = await Promise.all([
        import("simli-client/dist/client"),
        apiFetch<{ sessionToken: string; provider: string }>(`/api/sessions/${sessionId}/avatar`, { method: "POST" }),
      ]);
      if (provider !== "simli") throw new Error("Аватарын тохиргоо өөрчлөгдсөн байна. Хуудсаа дахин ачаална уу.");
      // LiveKit transport needs no ICE servers (P2P would). CRITICAL only: on page exit the
      // client logs a harmless "FAILED TO SEND FINAL MESSAGE" that Next.js shows as an issue;
      // real failures still arrive through the "error"/"startup_error" events below.
      const client = new SimliClient(sessionToken, videoRef.current, audioRef.current, null, LogLevel.CRITICAL, "livekit");
      client.on("start", () => setStatus("live"));
      client.on("speaking", () => setSpeaking(true));
      client.on("silent", () => setSpeaking(false));
      client.on("error", () => setStatus("error"));
      client.on("startup_error", (message) => {
        setFailure(String(message));
        setStatus("error");
      });
      clientRef.current = client;
      await client.start();
    } catch (error) {
      console.error("[avatar] Simli failed to start", error);
      setFailure(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  }

  return (
    <div className={className ?? "relative aspect-square w-full overflow-hidden rounded-xl bg-slate-900"}>
      <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" aria-label={`${name} — видео аватар`} />
      <audio ref={audioRef} autoPlay />
      {status !== "live" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-slate-200">
          {status === "connecting" ? (
            <>
              <Spinner />
              <span>Аватар холбогдож байна…</span>
            </>
          ) : (
            <>
              {status === "error" && <span>Аватар холбогдсонгүй.{failure && <span className="mt-1 block text-xs text-slate-400">{failure}</span>}</span>}
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
