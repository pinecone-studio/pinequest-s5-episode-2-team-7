import { describe, expect, it } from "vitest";
import { SpeechSegmenter } from "./vad";

const RATE = 16_000;
const FRAME = 1024; // 64 ms, the size the listener uses

/** A 64 ms frame of a 220 Hz tone at `amplitude` (0 = silence) plus tiny noise. */
function frame(amplitude: number, seed = 1): Float32Array {
  const f = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) f[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE) + 0.002 * Math.sin(i * seed);
  return f;
}

function feed(vad: SpeechSegmenter, amplitude: number, ms: number) {
  for (let t = 0; t < ms; t += 64) vad.feed(frame(amplitude));
}

function setup(options = {}) {
  const events = { starts: 0, utterances: [] as Float32Array[] };
  const vad = new SpeechSegmenter({ sampleRate: RATE, ...options }, { onSpeechStart: () => events.starts++, onUtterance: (s) => events.utterances.push(s) });
  return { vad, events };
}

describe("voice activity detection", () => {
  it("emits one utterance for speech followed by a pause, including the start", () => {
    const { vad, events } = setup();
    feed(vad, 0, 1000);
    feed(vad, 0.3, 1500);
    expect(events.starts).toBe(1);
    expect(events.utterances).toHaveLength(0);
    feed(vad, 0, 1000);
    expect(events.utterances).toHaveLength(1);
    const seconds = events.utterances[0].length / RATE;
    expect(seconds).toBeGreaterThan(1.5); // preroll kept the first syllable
    expect(seconds).toBeLessThan(2.8);
  });

  it("keeps short pauses inside one utterance", () => {
    const { vad, events } = setup();
    feed(vad, 0.3, 800);
    feed(vad, 0, 400); // breath between words
    feed(vad, 0.3, 800);
    feed(vad, 0, 1000);
    expect(events.utterances).toHaveLength(1);
  });

  it("ignores clicks and coughs that are too short", () => {
    const { vad, events } = setup();
    feed(vad, 0, 500);
    feed(vad, 0.5, 64);
    feed(vad, 0, 1000);
    expect(events.starts).toBe(0);
    expect(events.utterances).toHaveLength(0);
  });

  it("adapts to steady background noise", () => {
    const { vad, events } = setup();
    feed(vad, 0.01, 3000); // fan / room noise
    expect(events.starts).toBe(0);
    feed(vad, 0.3, 1000);
    feed(vad, 0.01, 1000);
    expect(events.utterances).toHaveLength(1);
  });

  it("cuts utterances at the maximum length", () => {
    const { vad, events } = setup({ maxMs: 3000 });
    feed(vad, 0.3, 7000);
    expect(events.utterances.length).toBeGreaterThanOrEqual(2);
    for (const u of events.utterances) expect(u.length / RATE).toBeLessThanOrEqual(3.1);
  });

  it("is harder to trigger while the patient is talking (sensitivity)", () => {
    const { vad, events } = setup();
    feed(vad, 0, 1000);
    vad.sensitivity = 3;
    feed(vad, 0.02, 1000); // patient's voice leaking from the speakers
    expect(events.starts).toBe(0);
    feed(vad, 0.3, 500); // student speaks up
    expect(events.starts).toBe(1);
  });
});
