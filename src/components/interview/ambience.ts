import type { SceneId } from "@/lib/scenes";

/**
 * Quiet, synthesized background sound for a call scene (no audio files):
 * a distant siren, traffic rumble, monitor beeps, wind, a ticking clock.
 * Kept low so the patient's voice and the student's microphone stay clear;
 * `duck()` fades it out while the student is talking.
 */
export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private stops: (() => void)[] = [];
  private level = 1;

  start(scene: SceneId) {
    this.stop();
    if (scene === "original") return;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(this.level, ctx.currentTime + 1.5);
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    void ctx.resume();

    if (scene === "accident") {
      this.siren(0.022);
      this.rumble(0.05, 180);
    } else if (scene === "ambulance") {
      this.rumble(0.06, 120);
      this.beeps(0.025, 950);
      this.siren(0.008);
    } else if (scene === "er") {
      this.beeps(0.02, 820);
      this.rumble(0.02, 400);
    } else if (scene === "home") {
      this.ticks(0.03);
    } else if (scene === "steppe") {
      this.wind(0.05);
    }
  }

  /** Fade out while the student talks (`true`), back in afterwards. */
  duck(on: boolean) {
    this.level = on ? 0.15 : 1;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.level, this.ctx.currentTime, 0.25);
  }

  stop() {
    this.stops.forEach((s) => s());
    this.stops = [];
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  private out(gain: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = gain;
    g.connect(this.master!);
    return g;
  }

  private noise(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Brown-ish noise: softer than white noise.
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  /** European-style wail, heard from a distance (low-passed). */
  private siren(gain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 850;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.33;
    const depth = ctx.createGain();
    depth.gain.value = 300;
    lfo.connect(depth).connect(osc.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    osc.connect(lp).connect(this.out(gain));
    osc.start();
    lfo.start();
    this.stops.push(() => {
      osc.stop();
      lfo.stop();
    });
  }

  private rumble(gain: number, cutoff: number) {
    const ctx = this.ctx!;
    const src = this.noise();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff;
    src.connect(lp).connect(this.out(gain));
    src.start();
    this.stops.push(() => src.stop());
  }

  private wind(gain: number) {
    const ctx = this.ctx!;
    const src = this.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 500;
    bp.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const depth = ctx.createGain();
    depth.gain.value = 300;
    lfo.connect(depth).connect(bp.frequency);
    src.connect(bp).connect(this.out(gain));
    src.start();
    lfo.start();
    this.stops.push(() => {
      src.stop();
      lfo.stop();
    });
  }

  /** Patient-monitor beep about once a second. */
  private beeps(gain: number, freq: number) {
    this.repeat(900, (ctx, at) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(gain, at + 0.01);
      g.gain.setValueAtTime(gain, at + 0.08);
      g.gain.linearRampToValueAtTime(0, at + 0.1);
      osc.connect(g).connect(this.master!);
      osc.start(at);
      osc.stop(at + 0.12);
    });
  }

  private ticks(gain: number) {
    this.repeat(1000, (ctx, at) => {
      const src = this.noise();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 2500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
      src.connect(hp).connect(g).connect(this.master!);
      src.start(at);
      src.stop(at + 0.04);
    });
  }

  private repeat(ms: number, play: (ctx: AudioContext, at: number) => void) {
    const timer = setInterval(() => {
      if (this.ctx && this.master) play(this.ctx, this.ctx.currentTime + 0.05);
    }, ms);
    this.stops.push(() => clearInterval(timer));
  }
}
