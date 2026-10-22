import { SpeechSegmenter } from "./vad";

export const MAX_RECORD_SECONDS = 14;
const RATE = 16_000;

/**
 * Records the microphone as 16 kHz mono 16-bit WAV — the format Chimege STT
 * expects. Chimege accepts at most 15 s per request, so recording stops
 * itself at MAX_RECORD_SECONDS.
 */
export class Recorder {
  private stream?: MediaStream;
  private ctx?: AudioContext;
  private node?: ScriptProcessorNode;
  private chunks: Float32Array[] = [];
  /** Called once when the time limit is reached. */
  onLimit?: () => void;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    this.ctx = new AudioContext({ sampleRate: RATE });
    const source = this.ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor is deprecated but universally supported and enough here.
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.node.onaudioprocess = (e) => {
      this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      if (this.length >= MAX_RECORD_SECONDS * RATE && this.onLimit) {
        const done = this.onLimit;
        this.onLimit = undefined;
        done();
      }
    };
    source.connect(this.node);
    this.node.connect(this.ctx.destination);
  }

  private get length(): number {
    return this.chunks.reduce((n, c) => n + c.length, 0);
  }

  /** Stops recording and returns the WAV bytes. */
  async stop(): Promise<Blob> {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close();
    const all = new Float32Array(this.length);
    let at = 0;
    for (const c of this.chunks) {
      all.set(c, at);
      at += c.length;
    }
    return new Blob([encodeWav(all.subarray(0, MAX_RECORD_SECONDS * RATE))], { type: "audio/wav" });
  }
}

/**
 * Hands-free listening: keeps the microphone open and hands each detected
 * utterance (see vad.ts) to `onUtterance` as a WAV blob.
 */
export class Listener {
  private stream?: MediaStream;
  private ctx?: AudioContext;
  private node?: ScriptProcessorNode;
  readonly vad: SpeechSegmenter;

  constructor(events: { onSpeechStart: () => void; onUtterance: (wav: Blob) => void }) {
    this.vad = new SpeechSegmenter(
      { sampleRate: RATE, maxMs: MAX_RECORD_SECONDS * 1000 },
      { onSpeechStart: events.onSpeechStart, onUtterance: (samples) => events.onUtterance(new Blob([encodeWav(samples)], { type: "audio/wav" })) },
    );
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.ctx = new AudioContext({ sampleRate: RATE });
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(1024, 1, 1); // 64 ms frames
    this.node.onaudioprocess = (e) => this.vad.feed(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(this.node);
    this.node.connect(this.ctx.destination);
  }

  async stop(): Promise<void> {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close();
  }
}

function encodeWav(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return buffer;
}
