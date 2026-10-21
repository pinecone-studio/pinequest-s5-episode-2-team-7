/**
 * Voice activity detection for hands-free conversation: splits a continuous
 * microphone stream into utterances by loudness, with an adaptive noise floor.
 * Pure logic (no Web Audio) so it is unit-tested with synthetic frames.
 */
export interface VadOptions {
  sampleRate: number;
  /** Loud audio needed before an utterance starts (ignores clicks). */
  startMs?: number;
  /** Silence that ends an utterance. */
  endSilenceMs?: number;
  /** Utterances are cut at this length (Chimege STT accepts ≤ 15 s). */
  maxMs?: number;
  /** Shorter utterances (coughs, "мм") are dropped. */
  minSpeechMs?: number;
  /** Audio kept from just before the start so the first syllable is not lost. */
  prerollMs?: number;
}

export interface VadEvents {
  /** Speech began — used to interrupt the patient (barge-in). */
  onSpeechStart?: () => void;
  /** A complete utterance, ready to transcribe. */
  onUtterance?: (samples: Float32Array) => void;
}

const MIN_THRESHOLD = 0.012;

export class SpeechSegmenter {
  private readonly o: Required<VadOptions>;
  private noise = 0.005;
  private speaking = false;
  private loudMs = 0;
  private silentMs = 0;
  private speechMs = 0;
  private frames: Float32Array[] = [];
  private preroll: Float32Array[] = [];
  /**
   * Raises the threshold, e.g. while the patient is talking so its voice
   * leaking from the speakers does not count as the student speaking.
   */
  sensitivity = 1;

  constructor(
    options: VadOptions,
    private readonly events: VadEvents = {},
  ) {
    // 550 ms: short enough to answer promptly, long enough not to cut a question at a natural pause.
    this.o = { startMs: 160, endSilenceMs: 550, maxMs: 14_000, minSpeechMs: 350, prerollMs: 300, ...options };
  }

  get threshold(): number {
    return Math.max(MIN_THRESHOLD, this.noise * 3) * this.sensitivity;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  feed(frame: Float32Array): void {
    const ms = (frame.length / this.o.sampleRate) * 1000;
    const level = rms(frame);
    const loud = level > this.threshold;

    if (!this.speaking) {
      // Track background noise only while nobody is speaking.
      if (!loud) this.noise = this.noise * 0.95 + level * 0.05;
      this.preroll.push(frame);
      while (this.preroll.length > 1 && duration(this.preroll, this.o.sampleRate) > this.o.prerollMs + ms) this.preroll.shift();
      this.loudMs = loud ? this.loudMs + ms : 0;
      if (this.loudMs >= this.o.startMs) {
        this.speaking = true;
        this.frames = [...this.preroll];
        this.preroll = [];
        this.speechMs = this.loudMs;
        this.silentMs = 0;
        this.events.onSpeechStart?.();
      }
      return;
    }

    this.frames.push(frame);
    if (loud) {
      this.speechMs += ms;
      this.silentMs = 0;
    } else {
      this.silentMs += ms;
    }
    if (this.silentMs >= this.o.endSilenceMs || duration(this.frames, this.o.sampleRate) >= this.o.maxMs) this.finish();
  }

  /** Ends the current utterance now (e.g. when listening is switched off). */
  flush(): void {
    if (this.speaking) this.finish();
  }

  private finish() {
    const frames = this.frames;
    const enough = this.speechMs >= this.o.minSpeechMs;
    this.speaking = false;
    this.frames = [];
    this.loudMs = 0;
    this.silentMs = 0;
    this.speechMs = 0;
    if (enough) this.events.onUtterance?.(concat(frames));
  }
}

function rms(frame: Float32Array): number {
  let sum = 0;
  for (const s of frame) sum += s * s;
  return Math.sqrt(sum / Math.max(1, frame.length));
}

function duration(frames: Float32Array[], rate: number): number {
  return (frames.reduce((n, f) => n + f.length, 0) / rate) * 1000;
}

function concat(frames: Float32Array[]): Float32Array {
  const out = new Float32Array(frames.reduce((n, f) => n + f.length, 0));
  let at = 0;
  for (const f of frames) {
    out.set(f, at);
    at += f.length;
  }
  return out;
}
