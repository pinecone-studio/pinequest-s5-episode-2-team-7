/**
 * Plays the persona's voice. In "audio" (phone) mode the voice goes through a
 * telephone band-pass (300–3400 Hz) with soft background noise, and the call
 * starts with a ring tone — cheap, but it makes it feel like a real call.
 */
export type Background = "home" | "street" | "office" | null;

export class Speaker {
  private ctx?: AudioContext;
  private input?: AudioNode;
  private noise?: AudioBufferSourceNode;

  /** Must be called inside a tap (browsers only allow audio after a user gesture). */
  async init({ phone, background }: { phone: boolean; background: Background }): Promise<void> {
    const ctx = new AudioContext();
    this.ctx = ctx;
    await ctx.resume().catch(() => {});
    if (phone) {
      const hp = this.filter("highpass", 300);
      const lp = this.filter("lowpass", 3400);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.ratio.value = 4;
      hp.connect(lp).connect(comp).connect(ctx.destination);
      this.input = hp;
      if (background) this.startNoise(background);
    } else {
      this.input = ctx.destination;
    }
  }

  private filter(type: BiquadFilterType, frequency: number): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    return f;
  }

  /** Brown noise coloured by the place: no recordings needed. */
  private startNoise(kind: Exclude<Background, null>) {
    const ctx = this.ctx!;
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const tone = this.filter("lowpass", kind === "street" ? 1200 : kind === "office" ? 600 : 800);
    const gain = ctx.createGain();
    gain.gain.value = kind === "office" ? 0.025 : 0.05;
    source.connect(tone).connect(gain).connect(this.input!);
    source.start();
    this.noise = source;
  }

  /** Incoming-call tone (425 Hz, 1 s on / 3 s off). Returns a function that stops it. */
  ring(): () => void {
    const ctx = this.ctx;
    if (!ctx) return () => {};
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.frequency.value = 425;
    osc.connect(gain);
    osc.start();
    const t = ctx.currentTime;
    for (let i = 0; i < 15; i++) {
      gain.gain.setValueAtTime(0.18, t + i * 4);
      gain.gain.setValueAtTime(0, t + i * 4 + 1);
    }
    return () => {
      try {
        osc.stop();
        gain.disconnect();
      } catch {
        // Already stopped.
      }
    };
  }

  beep(frequency = 880, seconds = 0.15) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  /** Plays a WAV; resolves `done` when it ends or is stopped. */
  async play(wav: ArrayBuffer): Promise<{ done: Promise<void>; stop: () => void }> {
    const ctx = this.ctx!;
    const buffer = await ctx.decodeAudioData(wav.slice(0));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.input!);
    const done = new Promise<void>((resolve) => (source.onended = () => resolve()));
    source.start();
    return {
      done,
      stop: () => {
        try {
          source.stop();
        } catch {
          // Not started or already stopped.
        }
      },
    };
  }

  close() {
    try {
      this.noise?.stop();
    } catch {
      // Not running.
    }
    void this.ctx?.close().catch(() => {});
  }
}
