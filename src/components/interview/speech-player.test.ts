import { describe, expect, it } from "vitest";
import type { AvatarHandle } from "./simli-avatar";
import { SpeechPlayer, wavFromPcm } from "./speech-player";

function fakeAvatar() {
  const calls: { bytes: number; last: boolean }[] = [];
  const avatar: AvatarHandle = {
    ready: true,
    speak: () => undefined,
    interrupt: () => undefined,
    setEmotion: () => undefined,
    speakPcm: (pcm, last) => calls.push({ bytes: pcm.length, last }),
  };
  return { avatar, calls };
}

describe("SpeechPlayer.stream", () => {
  it("forwards each piece to a live avatar and closes the utterance once", () => {
    const { avatar, calls } = fakeAvatar();
    const player = new SpeechPlayer(() => avatar, () => undefined);
    const utterance = player.stream();
    utterance.push(new Uint8Array(320));
    utterance.push(new Uint8Array(640));
    utterance.end();
    expect(calls).toEqual([
      { bytes: 320, last: false },
      { bytes: 640, last: false },
      { bytes: 0, last: true },
    ]);
  });

  it("drops pieces that arrive after the student interrupted", () => {
    const { avatar, calls } = fakeAvatar();
    const player = new SpeechPlayer(() => avatar, () => undefined);
    const utterance = player.stream();
    player.stop();
    utterance.push(new Uint8Array(320));
    utterance.end();
    expect(calls).toEqual([]);
  });
});

describe("wavFromPcm", () => {
  it("wraps PCM16 pieces in a 16 kHz mono WAV header", () => {
    const wav = new DataView(wavFromPcm([new Uint8Array(4), new Uint8Array(6)]));
    expect(wav.byteLength).toBe(54);
    expect(wav.getUint32(24, true)).toBe(16_000);
    expect(wav.getUint32(40, true)).toBe(10);
  });
});
