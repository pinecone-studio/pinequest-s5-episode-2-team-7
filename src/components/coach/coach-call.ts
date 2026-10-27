import type { CoachDifficulty, CoachEmotion, CoachLine, CoachMode, PublicPack, TurnEvent } from "@/lib/coach/types";
import { Listener } from "../interview/recorder";
import type { AvatarHandle } from "../interview/simli-avatar";
import { Speaker } from "./speaker";

/**
 * One practice conversation with an AI persona, without React: the page
 * renders what this reports through `CallEvents`.
 *
 * Feeling like a real person is mostly about timing, so:
 * - the persona's reply streams in sentence by sentence and each sentence is
 *   voiced as soon as it arrives (sentences are synthesized in parallel and
 *   played in order);
 * - if nothing has arrived after 0.9 s, a short filler («Аа...») plays;
 * - the trainee just talks (hands-free VAD) and may interrupt: speech stops
 *   the voice and cancels the pending reply;
 * - after a long silence the persona speaks up by itself.
 */

export type ChatLine = { role: "me" | "ai" | "sys"; text: string; t: number };
export type EndReason = "ended" | "timeout" | "stopped";

export interface CallEvents {
  chat(lines: ChatLine[]): void;
  status(text: string): void;
  emotion(e: CoachEmotion): void;
  speaking(on: boolean): void;
  listening(on: boolean): void;
  tick(seconds: number): void;
  ended(reason: EndReason): void;
}

interface Utterance {
  gen: number;
  emo: CoachEmotion;
  spoken: string[];
  t: number;
  add(text: string): void;
  addReady(text: string, wav: Promise<ArrayBuffer | null>): void;
  finish(): void;
  done: Promise<void>;
}

const wavMs = (wav: ArrayBuffer) => Math.max(0, wav.byteLength - 44) / 32;

export class CoachCall {
  readonly history: CoachLine[] = [];
  private chat: ChatLine[] = [];
  private bubble = -1;
  private gen = 0;
  private t0 = 0;
  private ended = false;
  private aiSpeaking = false;
  private thinking = false;
  private stopCurrent: (() => void) | null = null;
  private turnAbort: AbortController | null = null;
  private silenceTimer?: ReturnType<typeof setTimeout>;
  private clock?: ReturnType<typeof setInterval>;
  private nudges = 0;
  private fillers: { text: string; wav: Promise<ArrayBuffer | null> }[] = [];
  private emo: CoachEmotion;
  private listener: Listener | null = null;
  private readonly speaker = new Speaker();
  /** The trainee is typing or holding the mic button: no hands-free nudges. */
  manual = false;

  constructor(
    private readonly pack: PublicPack,
    private readonly mode: CoachMode,
    private readonly difficulty: CoachDifficulty,
    private readonly avatar: () => AvatarHandle | null,
    private readonly ev: CallEvents,
  ) {
    this.emo = pack.openingEmotion;
  }

  /** Call inside the start tap: unlocks audio and prepares the filler sounds. */
  async prepare(): Promise<void> {
    const phone = this.mode === "audio";
    await this.speaker.init({ phone, background: phone ? (this.pack.kind === "dispatch" ? "home" : "office") : null });
    this.fillers = this.pack.fillers.map((text) => ({ text, wav: this.tts(text, "calm").catch(() => null) }));
  }

  ring(): () => void {
    return this.speaker.ring();
  }

  beep(frequency: number, seconds: number) {
    this.speaker.beep(frequency, seconds);
  }

  elapsed(): number {
    return this.t0 ? Math.round((performance.now() - this.t0) / 1000) : 0;
  }

  async begin(): Promise<void> {
    this.t0 = performance.now();
    this.clock = setInterval(() => {
      const s = this.elapsed();
      this.ev.tick(s);
      if (s >= this.pack.maxSec) void this.finish("timeout");
    }, 500);
    try {
      this.listener = new Listener({ onSpeechStart: () => this.userStarted(), onUtterance: (wav) => void this.userEnded(wav) });
      await this.listener.start();
      this.ev.listening(true);
    } catch {
      this.listener = null;
      this.ev.status("Микрофон нээгдсэнгүй. Доор бичиж хариулна уу.");
    }
    this.setEmotion(this.pack.openingEmotion);
    const u = this.utterance(this.emo);
    u.add(this.pack.opening);
    u.finish();
    await u.done;
    this.record(u);
    if (this.gen === u.gen && !this.ended) this.setAiSpeaking(false);
  }

  // --- talking -------------------------------------------------------------

  private async tts(text: string, emotion: CoachEmotion): Promise<ArrayBuffer> {
    const response = await fetch("/api/coach/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packRef: this.pack.id, text, emotion }),
    });
    if (!response.ok) throw new Error(`tts ${response.status}`);
    return response.arrayBuffer();
  }

  private setEmotion(e: CoachEmotion) {
    this.emo = e;
    this.ev.emotion(e);
  }

  private pushChat(line: ChatLine): number {
    this.chat = [...this.chat, line];
    this.ev.chat(this.chat);
    return this.chat.length - 1;
  }

  private showAi(text: string, fresh: boolean) {
    if (fresh || this.bubble < 0 || this.chat[this.bubble]?.role !== "ai") {
      this.bubble = this.pushChat({ role: "ai", text, t: this.elapsed() });
      return;
    }
    this.chat = this.chat.map((l, i) => (i === this.bubble ? { ...l, text: `${l.text} ${text}` } : l));
    this.ev.chat(this.chat);
  }

  /** One reply: sentences are voiced as they arrive (in parallel) and played in order. */
  private utterance(emo: CoachEmotion): Utterance {
    const gen = ++this.gen;
    const items: { text: string; wav: Promise<ArrayBuffer | null> }[] = [];
    let finished = false;
    let wake: (() => void) | null = null;
    let first = true;
    const u: Utterance = {
      gen,
      emo,
      spoken: [],
      t: this.elapsed(),
      add: (text) => {
        items.push({ text, wav: this.tts(text, u.emo).catch(() => null) });
        wake?.();
      },
      addReady: (text, wav) => {
        items.push({ text, wav });
        wake?.();
      },
      finish: () => {
        finished = true;
        wake?.();
      },
      done: Promise.resolve(),
    };
    u.done = (async () => {
      let i = 0;
      while (this.gen === gen && !this.ended) {
        if (i < items.length) {
          const item = items[i++];
          const wav = await item.wav;
          if (this.gen !== gen || this.ended) break;
          u.spoken.push(item.text);
          this.showAi(item.text, first);
          first = false;
          if (!wav) continue; // no voice: the text is still on screen
          this.setAiSpeaking(true);
          await this.play(wav);
        } else if (finished) {
          break;
        } else {
          await new Promise<void>((resolve) => (wake = resolve));
          wake = null;
        }
      }
    })();
    return u;
  }

  private async play(wav: ArrayBuffer): Promise<void> {
    const avatar = this.mode === "video" ? this.avatar() : null;
    if (avatar?.ready) {
      avatar.speak(wav);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, wavMs(wav) + 250);
        this.stopCurrent = () => {
          clearTimeout(timer);
          avatar.interrupt();
          resolve();
        };
      });
    } else {
      try {
        const playing = await this.speaker.play(wav);
        this.stopCurrent = playing.stop;
        await playing.done;
      } catch {
        // Undecodable audio: skip it.
      }
    }
    this.stopCurrent = null;
  }

  private record(u: Utterance) {
    if (u.spoken.length) this.history.push({ role: "ai", text: u.spoken.join(" ") + (this.gen !== u.gen ? " —(тасалсан)" : ""), t: u.t });
  }

  private setAiSpeaking(on: boolean) {
    this.aiSpeaking = on;
    // While the persona talks, its voice from the speaker must not count as the trainee.
    if (this.listener) this.listener.vad.sensitivity = on ? 2.5 : 1;
    this.ev.speaking(on);
    if (on) {
      this.clearSilence();
      this.ev.status("Ярьж байна… (тасалж ярьж болно)");
    } else if (!this.thinking && !this.ended) {
      this.ev.status(this.listener ? "🎙️ Таны ээлж: ярина уу" : "Таны ээлж: бичнэ үү");
      this.armSilence();
    }
  }

  private interrupt() {
    this.gen++;
    this.stopCurrent?.();
    this.turnAbort?.abort();
    this.thinking = false;
    this.aiSpeaking = false;
    if (this.listener) this.listener.vad.sensitivity = 1;
    this.ev.speaking(false);
  }

  private userStarted() {
    if (this.ended) return;
    this.clearSilence();
    if (this.aiSpeaking || this.thinking) this.interrupt();
    this.ev.status("👂 Сонсож байна…");
  }

  /** A finished utterance from the hands-free listener or the mic button. */
  async userEnded(wav: Blob): Promise<void> {
    if (this.ended) return;
    this.ev.status("Бичвэр болгож байна…");
    let text = "";
    try {
      const response = await fetch(`/api/coach/transcribe${this.pack.language === "en" ? "?lang=en" : ""}`, {
        method: "POST",
        headers: { "content-type": "audio/wav" },
        body: wav,
      });
      const body = (await response.json()) as { text?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Яриа танигдсангүй.");
      text = (body.text ?? "").trim();
    } catch (e) {
      this.ev.status(e instanceof Error ? e.message : "Яриа танигдсангүй.");
      this.armSilence();
      return;
    }
    if (!text) {
      this.ev.status("Үг танигдсангүй, дахин хэлнэ үү.");
      this.armSilence();
      return;
    }
    this.say(text);
  }

  /** The trainee said (or typed) something. */
  say(text: string) {
    if (this.ended || !text.trim()) return;
    if (this.aiSpeaking || this.thinking) this.interrupt();
    this.nudges = 0;
    this.pushChat({ role: "me", text, t: this.elapsed() });
    this.history.push({ role: "me", text, t: this.elapsed() });
    void this.runTurn();
  }

  /** Pause hands-free listening (while the mic button records). */
  pauseListening(paused: boolean) {
    if (this.listener) this.listener.vad.sensitivity = paused ? 1_000 : this.aiSpeaking ? 2.5 : 1;
  }

  private async runTurn(): Promise<void> {
    if (this.ended) return;
    this.thinking = true;
    this.clearSilence();
    this.ev.status("…");
    const abort = new AbortController();
    this.turnAbort = abort;
    const u = this.utterance(this.emo);
    let got = false;
    let endCall = false;
    const fillerTimer = setTimeout(() => {
      if (!got && this.fillers.length && this.gen === u.gen) {
        const f = this.fillers[Math.floor(Math.random() * this.fillers.length)];
        u.addReady(f.text, f.wav);
      }
    }, 900);
    try {
      const response = await fetch("/api/coach/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({ packRef: this.pack.id, mode: this.mode, difficulty: this.difficulty, history: this.history.slice(-40) }),
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `Алдаа (${response.status})`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line) as TurnEvent;
          if (event.t === "emo") {
            u.emo = event.v;
            this.setEmotion(event.v);
          } else if (event.t === "say") {
            got = true;
            u.add(event.text);
          } else if (event.t === "end") {
            endCall = true;
          } else if (event.t === "error") {
            throw new Error(event.error);
          }
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) this.ev.status(e instanceof Error ? e.message : "AI хариулж чадсангүй.");
    } finally {
      clearTimeout(fillerTimer);
      if (this.turnAbort === abort) this.turnAbort = null;
    }
    if (this.gen === u.gen) this.thinking = false;
    u.finish();
    await u.done;
    this.record(u);
    if (this.gen !== u.gen || this.ended) return;
    this.setAiSpeaking(false);
    if (endCall) setTimeout(() => void this.finish("ended"), 900);
  }

  private clearSilence() {
    clearTimeout(this.silenceTimer);
  }

  /** After a long silence the persona speaks up (at most twice in a row). */
  private armSilence() {
    this.clearSilence();
    if (this.ended || !this.listener) return;
    this.silenceTimer = setTimeout(
      () => {
        if (this.ended || this.aiSpeaking || this.thinking || this.manual || this.listener?.vad.isSpeaking) return;
        if (this.nudges >= 2) return;
        this.nudges++;
        this.pushChat({ role: "sys", text: "… чимээгүй", t: this.elapsed() });
        this.history.push({ role: "me", text: "(чимээгүй)", t: this.elapsed() });
        void this.runTurn();
      },
      this.mode === "audio" ? 6_000 : 9_000,
    );
  }

  async finish(reason: EndReason): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    clearInterval(this.clock);
    this.clearSilence();
    this.gen++;
    this.stopCurrent?.();
    this.turnAbort?.abort();
    await this.listener?.stop().catch(() => {});
    this.ev.listening(false);
    if (this.mode === "audio") this.speaker.beep(480, 0.25);
    setTimeout(() => this.speaker.close(), 600);
    // Let an interrupted sentence reach the transcript.
    await new Promise((resolve) => setTimeout(resolve, 80));
    this.ev.ended(reason);
  }
}
