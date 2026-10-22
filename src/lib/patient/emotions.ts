/**
 * The patient's emotional state, chosen by the student (or teacher) during a
 * call. One id drives three layers so they always agree:
 *   - the language model (persona emotional state → word choice, questions back)
 *   - the voice (ElevenLabs audio tag, when enabled)
 *   - the face (Anam Director Notes: start style + live cue)
 * Safe to import from client and server code.
 */
export const EMOTION_IDS = ["calm", "worried", "in_pain", "scared", "panicked", "angry"] as const;
export type EmotionId = (typeof EMOTION_IDS)[number];

type AnamCue = "warm" | "concerned" | "sad" | "distressed" | "angry";
type AnamPreset = "warm" | "sad" | "distressed" | "angry";

export interface Emotion {
  id: EmotionId;
  label: string;
  emoji: string;
  /** Replaces the case's emotional state in the patient prompt (Mongolian). */
  persona: string;
  /** ElevenLabs v3/v4 audio tag, e.g. "[scared]". */
  voiceTag: string;
  anamCue: AnamCue;
  anamPreset: AnamPreset;
}

export const EMOTIONS: Record<EmotionId, Emotion> = {
  calm: {
    id: "calm",
    label: "Тайван",
    emoji: "🙂",
    persona: "Тайван, эмчид итгэлтэй. Асуултад энгийн, найрсаг хариулна.",
    voiceTag: "",
    anamCue: "warm",
    anamPreset: "warm",
  },
  worried: {
    id: "worried",
    label: "Санаа зовсон",
    emoji: "😟",
    persona: "Санаа зовж байна. Хариултынхаа төгсгөлд заримдаа «Ноцтой юм биш биз дээ, эмч ээ?» гэх мэт асуулт нэмнэ.",
    voiceTag: "[worried]",
    anamCue: "concerned",
    anamPreset: "sad",
  },
  in_pain: {
    id: "in_pain",
    label: "Өвдөж байна",
    emoji: "😣",
    persona: "Маш их өвдөж байгаа тул богино, тасалдсан өгүүлбэрээр ярина, үгсийн хооронд амьсгаа авна («Аа... өвдөөд...»).",
    voiceTag: "[in pain]",
    anamCue: "sad",
    anamPreset: "sad",
  },
  scared: {
    id: "scared",
    label: "Айсан",
    emoji: "😨",
    persona: "Айж байна. Үхэх вий, хагалгаанд орох вий гэж эмээж, тайвшруулахыг хүснэ.",
    voiceTag: "[scared]",
    anamCue: "distressed",
    anamPreset: "distressed",
  },
  panicked: {
    id: "panicked",
    label: "Сандарсан",
    emoji: "😰",
    persona: "Сандарч байна. Хурдан, давхардуулж ярина, «Хурдан юм хийгээч!» гэх мэтээр яаравчилна.",
    voiceTag: "[panicked]",
    anamCue: "distressed",
    anamPreset: "distressed",
  },
  angry: {
    id: "angry",
    label: "Уурласан",
    emoji: "😠",
    persona: "Удаан хүлээлгэсэнд уурлаж бухимдсан. Хатуу, богино хариулна, «Хэдэн удаа асуух юм бэ?» гэх мэтээр гомдоллоно, гэхдээ асуултад хариулна.",
    voiceTag: "[angry]",
    anamCue: "angry",
    anamPreset: "angry",
  },
};

export function isEmotionId(value: unknown): value is EmotionId {
  return typeof value === "string" && (EMOTION_IDS as readonly string[]).includes(value);
}
