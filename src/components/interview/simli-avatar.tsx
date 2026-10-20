"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
// simli-client 3.0.2's index.js requires "./Client" but ships "client.js";
// importing the real file directly works on case-sensitive bundlers (Turbopack).
import type { SimliClient } from "simli-client/dist/client";
import { apiFetch } from "@/lib/fetcher";
import { Button, Spinner } from "../ui";

export interface AvatarHandle {
  /** True once the video avatar is live and can lip-sync. */
  ready: boolean;
  /** Lip-sync a 16 kHz PCM16 WAV (the patient's Chimege voice). */
  speak(wav: ArrayBuffer): void;
}

type Status = "off" | "connecting" | "live" | "error";

/**
 * Simli talking-head video of the patient. Started on demand (it is billed
 * per minute) and stopped when the interview page unmounts.
 */
export function SimliAvatar({ sessionId, name, ref }: { sessionId: string; name: string; ref?: Ref<AvatarHandle> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clientRef = useRef<SimliClient | null>(null);
  const [status, setStatus] = useState<Status>("off");
  const [speaking, setSpeaking] = useState(false);

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
    }),
    [status],
  );

  useEffect(() => () => void clientRef.current?.stop(), []);

  async function start() {
    if (!videoRef.current || !audioRef.current) return;
    setStatus("connecting");
    try {
      const [{ SimliClient, LogLevel }, { sessionToken }] = await Promise.all([
        import("simli-client/dist/client"),
        apiFetch<{ sessionToken: string }>(`/api/sessions/${sessionId}/avatar`, { method: "POST" }),
      ]);
      // LiveKit transport needs no ICE servers (P2P would).
      const client = new SimliClient(sessionToken, videoRef.current, audioRef.current, null, LogLevel.ERROR, "livekit");
      client.on("start", () => setStatus("live"));
      client.on("speaking", () => setSpeaking(true));
      client.on("silent", () => setSpeaking(false));
      client.on("error", () => setStatus("error"));
      client.on("startup_error", () => setStatus("error"));
      clientRef.current = client;
      await client.start();
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-900">
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
              {status === "error" && <span>Аватар холбогдсонгүй.</span>}
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
