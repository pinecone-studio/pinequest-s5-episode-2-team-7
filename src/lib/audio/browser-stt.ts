/**
 * The browser's own speech recognition (Chrome, Edge: Web Speech API), used
 * when the server has no speech-to-text service configured. Chrome sends the
 * audio to Google and supports Mongolian (mn-MN).
 */

interface RecognitionResultList {
  length: number;
  [index: number]: { isFinal: boolean; 0: { transcript: string } };
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export class BrowserRecognizer {
  private recognition?: Recognition;
  private finals: string[] = [];
  private interim = "";
  private error?: string;
  private ended?: Promise<void>;

  static supported(): boolean {
    return Boolean(ctor());
  }

  start(lang = "mn-MN"): void {
    const Ctor = ctor();
    if (!Ctor) throw new Error("SpeechRecognition unsupported");
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (event) => {
      this.interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) this.finals.push(result[0].transcript.trim());
        else this.interim += result[0].transcript;
      }
    };
    // "no-speech" and "aborted" just mean an empty result.
    r.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") this.error = event.error;
    };
    this.ended = new Promise((resolve) => (r.onend = () => resolve()));
    r.start();
    this.recognition = r;
  }

  /** Stops listening and returns everything recognised (rejects on a service error). */
  async stop(): Promise<string> {
    const r = this.recognition;
    if (!r) return "";
    this.recognition = undefined;
    r.stop();
    // Chrome delivers the last final result just before onend; don't hang if it never fires.
    await Promise.race([this.ended, new Promise((resolve) => setTimeout(resolve, 4000))]);
    if (this.error) throw new Error(this.error);
    return [...this.finals, this.interim.trim()].filter(Boolean).join(" ").trim();
  }

  cancel(): void {
    this.recognition?.abort();
    this.recognition = undefined;
  }
}
