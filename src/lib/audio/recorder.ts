/**
 * Microphone recorder that produces 16 kHz mono 16-bit WAV (the format the
 * speech-to-text endpoint expects) and exposes an AnalyserNode for the live
 * waveform. Stops itself at MAX_RECORD_SECONDS (the STT limit is 15 s).
 */
export const MAX_RECORD_SECONDS = 14;
const RATE = 16_000;

export class MicRecorder {
  analyser?: AnalyserNode;
  /** Called once when the time limit is reached. */
  onLimit?: () => void;
  private stream?: MediaStream;
  private ctx?: AudioContext;
  private node?: ScriptProcessorNode;
  private chunks: Float32Array[] = [];
  private samples = 0;

  static supported() {
    return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== "undefined";
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    // Native rate: a forced 16 kHz context cannot take a mic stream in Firefox. stop() resamples.
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    source.connect(this.analyser);
    // ScriptProcessor is deprecated but universally supported and enough for ≤ 14 s clips.
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.node.onaudioprocess = (e) => {
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      this.chunks.push(data);
      this.samples += data.length;
      if (this.samples >= MAX_RECORD_SECONDS * e.inputBuffer.sampleRate && this.onLimit) {
        const done = this.onLimit;
        this.onLimit = undefined;
        done();
      }
    };
    source.connect(this.node);
    this.node.connect(this.ctx.destination);
  }

  /** Stops recording and returns the WAV, or null if nothing was captured. */
  async stop(): Promise<Blob | null> {
    const rate = this.ctx?.sampleRate ?? RATE;
    this.cancel();
    if (this.samples < rate * 0.3) return null;
    const pcm = new Float32Array(this.samples);
    let offset = 0;
    for (const chunk of this.chunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    this.samples = 0;
    return encodeWav(rate === RATE ? pcm : resample(pcm, rate, RATE), RATE);
  }

  cancel() {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.ctx?.close().catch(() => {});
    this.node = undefined;
    this.stream = undefined;
    this.ctx = undefined;
    this.analyser = undefined;
  }
}

/** Some browsers ignore the requested sample rate; downsample linearly if so. */
function resample(input: Float32Array, from: number, to: number): Float32Array {
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    const frac = pos - j;
    out[i] = input[j] * (1 - frac) + (input[j + 1] ?? input[j]) * frac;
  }
  return out;
}

function encodeWav(pcm: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** 0..1 loudness of the analyser's current frame (RMS). */
export function readLevel(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = (buffer[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / buffer.length) * 3.2);
}
