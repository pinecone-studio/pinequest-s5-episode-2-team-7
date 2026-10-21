"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { AgentAudioInputStream, AnamClient } from "@anam-ai/js-sdk";
import { apiFetch } from "@/lib/fetcher";
import { Button, Spinner } from "../ui";
import type { AvatarHandle } from "./simli-avatar";

type Status = "off" | "connecting" | "live" | "error";

/** Anam starts rendering after it has buffered about this much audio. */
const ANAM_BUFFER_MS = 800;

/**
 * Anam talking-head video of the patient (audio-passthrough mode): Anam
 * renders and lip-syncs the face to the PCM we stream — the patient's own
 * TTS voice — so the AI and voice stay ours. Same handle as SimliAvatar.
 */
export function AnamAvatar({
  sessionId,
  name,
  onSpeakingChange,
  ref,
}: {
  sessionId: string;
  name: string;
  onSpeakingChange?: (speaking: boolean) => void;
  ref?: Ref<AvatarHandle>;
}) {
  const videoId = `anam-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const clientRef = useRef<AnamClient | null>(null);
  const streamRef = useRef<AgentAudioInputStream | null>(null);
  const speakingUntil = useRef(0);
  const speakingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState<Status>("off");
  const [speaking, setSpeaking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

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
      },
      interrupt() {
        if (status !== "live") return;
        clientRef.current?.interruptPersona();
        streamRef.current?.endSequence();
        speakingUntil.current = 0;
        clearTimeout(speakingTimer.current);
        setSpeaking(false);
      },
    }),
    [status],
  );

  useEffect(
    () => () => {
      clearTimeout(speakingTimer.current);
      void clientRef.current?.stopStreaming();
    },
    [],
  );
  useEffect(() => onSpeakingChange?.(speaking), [speaking, onSpeakingChange]);

  async function start() {
    setStatus("connecting");
    setFailure(null);
    try {
      const [{ createClient }, { sessionToken, provider }] = await Promise.all([
        import("@anam-ai/js-sdk"),
        apiFetch<{ sessionToken: string; provider: string }>(`/api/sessions/${sessionId}/avatar`, { method: "POST" }),
      ]);
      if (provider !== "anam") throw new Error("Аватарын тохиргоо өөрчлөгдсөн байна. Хуудсаа дахин ачаална уу.");
      // Our own microphone handling (Chimege STT) stays in charge.
      const client = createClient(sessionToken, { disableInputAudio: true });
      clientRef.current = client;
      await client.streamToVideoElement(videoId);
      streamRef.current = client.createAgentAudioInputStream({ encoding: "pcm_s16le", sampleRate: 16_000, channels: 1 });
      setStatus("live");
    } catch (error) {
      console.error("[avatar] Anam failed to start", error);
      setFailure(error instanceof Error ? error.message : String(error));
      void clientRef.current?.stopStreaming();
      clientRef.current = null;
      setStatus("error");
    }
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-900">
      <video id={videoId} autoPlay playsInline className="h-full w-full object-cover" aria-label={`${name} — видео аватар`} />
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
