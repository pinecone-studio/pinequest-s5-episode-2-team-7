import type { AvatarHandle } from "./simli-avatar";

/**
 * Plays the patient's speech in order: through the video avatar when it is
 * live (Simli queues the audio itself), otherwise as plain audio. `stop()`
 * silences everything at once (barge-in) and invalidates audio that is still
 * being downloaded, which callers detect through `generation`.
 */
export class SpeechPlayer {
  private queue: ArrayBuffer[] = [];
  private current: HTMLAudioElement | null = null;
  private gen = 0;

  constructor(
    private readonly avatar: () => AvatarHandle | null,
    private readonly onPlayingChange: (playing: boolean) => void,
  ) {}

  get generation(): number {
    return this.gen;
  }

  enqueue(wav: ArrayBuffer, generation = this.gen): void {
    if (generation !== this.gen) return; // stopped while it was downloading
    const avatar = this.avatar();
    if (avatar?.ready) {
      avatar.speak(wav);
      return;
    }
    this.queue.push(wav);
    if (!this.current) this.next();
  }

  /**
   * Plays one utterance that arrives in pieces (raw 16 kHz PCM16): straight
   * to the avatar while it is live, otherwise collected and played as one
   * WAV once complete. Pieces after `stop()` are dropped.
   */
  stream(generation = this.gen): { push(pcm: Uint8Array): void; end(): void } {
    const avatar = this.avatar();
    const live = avatar?.ready && avatar.speakPcm ? avatar : null;
    const pieces: Uint8Array[] = [];
    return {
      push: (pcm) => {
        if (generation !== this.gen) return;
        if (live) live.speakPcm!(pcm, false);
        else pieces.push(pcm);
      },
      end: () => {
        if (generation !== this.gen) return;
        if (live) live.speakPcm!(new Uint8Array(), true);
        else if (pieces.length > 0) this.enqueue(wavFromPcm(pieces), generation);
      },
    };
  }

  stop(): void {
    this.gen++;
    this.queue = [];
    this.current?.pause();
    this.current = null;
    this.avatar()?.interrupt();
    this.onPlayingChange(false);
  }

  private next() {
    const wav = this.queue.shift();
    if (!wav) {
      this.current = null;
      this.onPlayingChange(false);
      return;
    }
    const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    const audio = new Audio(url);
    this.current = audio;
    this.onPlayingChange(true);
    const done = () => {
      URL.revokeObjectURL(url);
      if (this.current === audio) this.next();
    };
    audio.onended = done;
    audio.play().catch(done);
  }
}

/** 16 kHz mono PCM16 pieces → a WAV file the browser can play. */
export function wavFromPcm(pieces: Uint8Array[], sampleRate = 16_000): ArrayBuffer {
  const size = pieces.reduce((n, p) => n + p.length, 0);
  const wav = new ArrayBuffer(44 + size);
  const view = new DataView(wav);
  const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + size, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, size, true);
  let at = 44;
  for (const piece of pieces) {
    new Uint8Array(wav, at, piece.length).set(piece);
    at += piece.length;
  }
  return wav;
}
