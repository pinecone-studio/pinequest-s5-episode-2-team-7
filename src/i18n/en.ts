import type { Strings } from "./mn";

/** English copy of `mn.ts` for judges and reviewers. Not shown in the app. */
export const en: Strings = {
  app: {
    name: "OTech",
    nameAccent: "AI",
    disclaimerTitle: "Disclaimer:",
    disclaimer:
      "This is an AI practice simulation. Emergency and health content does not replace professional guidance. In a real emergency call 103.",
  },
  errors: {
    generic: "Something went wrong. Please try again.",
    network: "Could not reach the server. Check your internet connection.",
    modelOffline: "The patient couldn't answer right now 😔 The model server may be down. Try again or use the offline demo.",
    micDenied: "Microphone permission was denied. Check your browser settings.",
    micUnsupported: "This browser cannot record audio.",
    sttUnavailable: "Speech-to-text is not available right now. Please type your question.",
    sttRetryBrowser: "The server speech service is down — switched to the browser's recogniser. Press the mic and speak again.",
    sttEmpty: "No speech recognised. Please speak again, closer to the mic.",
    tooLong: "Recordings can be at most 14 seconds.",
    rateLimited: "Too many requests. Wait a moment and try again.",
    useDemo: "Offline demo",
    dismiss: "Dismiss",
  },
};
