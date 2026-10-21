/**
 * Builds the student's "clinical notes" from the visible conversation only.
 * The server deliberately does not tell the browser which case facts were
 * disclosed, so this is a light keyword pass: the student's question decides
 * the heading, the patient's reply becomes the note.
 */
import type { MessageView } from "./views";

export type NoteCategory =
  | "onset"
  | "location"
  | "radiation"
  | "character"
  | "severity"
  | "duration"
  | "associated"
  | "negative"
  | "history"
  | "meds"
  | "social"
  | "family"
  | "exam";

export interface ClinicalNote {
  id: string;
  category: NoteCategory;
  text: string;
}

const RULES: [NoteCategory, RegExp][] = [
  ["radiation", /дамж|тарх|өөр газар|эрүү|нуруу руу|гар руу/],
  ["onset", /хэзээ|хэдийн|хэдэн цаг|хэдэн өдөр|эхэлс|эхлэв|гэнэт/],
  ["duration", /хэр удаа|хэдий удаа|үргэлж|тасралт|үе үе|хугацаа|минут/],
  ["location", /хаана|аль хэсэг|аль тал|байрла|хаагуур/],
  ["severity", /хэр хүчтэй|хүчтэй юу|10|арав|оноо|тэвчи/],
  ["character", /ямар өвдөлт|яаж өвд|ямар мэдрэмж|хатгу|базал|шахаж|дарж|хорсо|шинж/],
  ["meds", /(^|\s)эм(\s|$|[?.,])|эмүүд|эмчилгээ|харшил/],
  ["family", /аав|ээж|гэр бүл|удам|төрөл|ах |эгч|дүү/],
  ["social", /тамхи|архи|согтуу|ажил|мэргэж|хоолло|амьдар|жирэмс|сарын тэмдэг|бэлгийн/],
  ["history", /өмнө нь|урьд|өвчтэй|оношлогд|даралт|чихрийн|мэс засал|хагалгаа|хэвтэж|архаг/],
];

const NEGATIVE = /^(үгүй|үгүй ээ|үгүй дээ|байхгүй|огт|тийм юм байхгүй)|(байхгүй|үгүй|аваагүй|татдаггүй|уудаггүй)[.!]?$/i;
const GREETING = /^(сайн байна уу|сайн уу|мэнд)[^.!?]*[.!?]\s*/i;
const NO_INFO = /мэдэхгүй|санахгүй|ойлгосонгүй|ойлгохгүй|юу гэсэн үг/i;

function firstSentence(text: string, max = 110) {
  const sentence = text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text.trim();
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

export function buildNotes(messages: MessageView[]): ClinicalNote[] {
  const notes: ClinicalNote[] = [];
  let lastQuestion = "";
  for (const m of messages) {
    if (m.role === "student") {
      lastQuestion = m.content.toLowerCase();
      continue;
    }
    if (m.role === "narrator") {
      notes.push({ id: m.id, category: "exam", text: firstSentence(m.content.replace(/^үзлэг:\s*/i, ""), 140) });
      continue;
    }
    // The opening line of the patient is the chief complaint, not a finding.
    if (!lastQuestion || NO_INFO.test(m.content)) continue;
    const reply = m.content.trim().replace(GREETING, "");
    if (!reply) continue;
    const category: NoteCategory = NEGATIVE.test(reply.toLowerCase())
      ? "negative"
      : (RULES.find(([, re]) => re.test(lastQuestion))?.[0] ?? "associated");
    // A bare "no" needs the question for context.
    const text = category === "negative" && reply.length < 40 ? `${firstSentence(lastQuestion, 70).replace(/[?？]+$/, "")} — ${reply}` : firstSentence(reply);
    notes.push({ id: m.id, category, text });
  }
  return notes;
}
