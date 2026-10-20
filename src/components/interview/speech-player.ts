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
