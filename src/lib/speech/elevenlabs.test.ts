import { afterEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/lib/config";
import { synthesizeElevenLabs } from "./elevenlabs";

describe("ElevenLabs TTS", () => {
  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
    resetConfigForTests();
    vi.unstubAllGlobals();
  });

  it("never exceeds the plan's concurrency and retries a 429 once", async () => {
    process.env.ELEVENLABS_API_KEY = "el-test";
    resetConfigForTests();
    let inFlight = 0;
    let peak = 0;
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      const n = ++calls;
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return n === 1 ? new Response("busy", { status: 429 }) : new Response(new Uint8Array(320));
    });
    const results = await Promise.all(["Ммм...", "За...", "Өө...", "Тийм ээ."].map((t) => synthesizeElevenLabs(t, "voice")));
    expect(results).toHaveLength(4);
    expect(peak).toBeLessThanOrEqual(2); // default ELEVENLABS_CONCURRENCY
    expect(calls).toBe(5); // 4 requests + 1 retry
  });
});
