import { z } from "zod";
import type { CoachEmotion, CoachPack, RubricItem } from "./types";

/**
 * «Аватар студи»: a manager sets up the persona by hand — who it is, its mood,
 * the questions it must ask, what the company's staff should know and how the
 * answers are scored. No AI call: the pack is ready at once and costs nothing,
 * and the manager decides exactly what the AI asks.
 */

export const STUDIO_ROLES = ["interviewer", "customer", "caller", "patient", "buyer", "student", "colleague"] as const;
export const STUDIO_MOODS = ["friendly", "calm", "strict", "rushed", "worried", "angry"] as const;

export const StudioInputSchema = z.object({
  teamId: z.string().uuid().nullable().default(null),
  orgName: z.string().trim().max(120).default(""),
  title: z.string().trim().min(2).max(80),
  role: z.enum(STUDIO_ROLES).default("interviewer"),
  mood: z.enum(STUDIO_MOODS).default("calm"),
  personaName: z.string().trim().min(1).max(40),
  age: z.number().int().min(16).max(90).default(35),
  gender: z.enum(["female", "male"]).default("female"),
  /** Who practises: «шинэ борлуулагч», «ресепшний ажилтан»… */
  traineeRole: z.string().trim().max(120).default("шинэ ажилтан"),
  /** The situation in the manager's words (optional). */
  situation: z.string().trim().max(1_500).default(""),
  /** The persona asks these, one by one, in this order. */
  questions: z.array(z.string().trim().min(2).max(400)).max(15).default([]),
  /** What staff should know (rules, prices, values): one fact per line. Answers are checked against it. */
  knowledge: z.string().max(8_000).default(""),
  rubric: z.array(z.object({ label: z.string().trim().min(2).max(160), weight: z.number().int().min(1).max(5).default(1) })).max(10).default([]),
  /** The persona's first words (optional: a greeting is written otherwise). */
  opening: z.string().trim().max(400).default(""),
  mode: z.enum(["video", "audio"]).default("video"),
  timeLimitMin: z.number().int().min(1).max(30).default(5),
});
export type StudioInput = z.infer<typeof StudioInputSchema>;

const ROLE: Record<StudioInput["role"], { who: string; icon: string; goal: string }> = {
  interviewer: { who: "ажлын ярилцлага авч буй комиссын гишүүн / менежер", icon: "🧑‍💼", goal: "Ажилтны хариултаар түүний мэдлэг, хандлага, харилцааг шалгах." },
  customer: { who: "үйлчилгээний цэг дээр ирсэн үйлчлүүлэгч", icon: "🛎️", goal: "Хэрэгцээгээ шийдүүлэх, асуултдаа зөв хариулт авах." },
  caller: { who: "утсаар залгаж буй харилцагч", icon: "🎧", goal: "Асуудлаа утсаар шийдүүлэх." },
  patient: { who: "эмнэлэгт ирсэн өвчтөн", icon: "🩺", goal: "Тусламж авах, юу болохыг ойлгох." },
  buyer: { who: "бараа, үйлчилгээ сонирхож буй худалдан авагч", icon: "🛍️", goal: "Зөв сонголт хийх, үнэ, нөхцөлөө тодруулах." },
  student: { who: "сургалтад хамрагдаж буй суралцагч", icon: "🎒", goal: "Ойлгомжтой тайлбар авах." },
  colleague: { who: "хамт ажилладаг ажилтан", icon: "🤝", goal: "Ажлын асуудлаа хамтдаа шийдэх." },
};

const MOOD: Record<StudioInput["mood"], { text: string; emotion: CoachEmotion; rules: string[] }> = {
  friendly: { text: "найрсаг, урам өгдөг", emotion: "calm", rules: ["Найрсаг, дулаахан ярь. Ажилтан сандарвал тайвшруул."] },
  calm: { text: "тайван, тэнцвэртэй", emotion: "calm", rules: ["Тайван, мэргэжлийн өнгөөр ярь."] },
  strict: {
    text: "хатуу, шаардлага өндөртэй",
    emotion: "calm",
    rules: ["Хатуу, товч ярь. Бүрхэг, ерөнхий хариултыг хүлээж авахгүй: «Жишээ хэлээч», «Тодруулаач» гэж нэхэж асуу."],
  },
  rushed: { text: "яарсан, тэвчээр багатай", emotion: "worried", rules: ["Яарч байгаагаа илэрхийл. Урт тайлбарт тэвчээр алд: «Товчхон хэлээч»."] },
  worried: { text: "санаа зовсон, эргэлзсэн", emotion: "worried", rules: ["Санаа зовсноо илэрхийл. Ажилтан ойлгомжтой, итгэлтэй тайлбарлавал аажмаар тайвшир."] },
  angry: {
    text: "уурласан, гомдолтой",
    emotion: "angry",
    rules: [
      "Эхэндээ уурлаж, гомдлоо хэл. Ажилтан сонсож, ойлгосноо илэрхийлж, уучлалт гуйж, шийдэл санал болговол аажмаар тайвшир.",
      "Ажилтан маргаж, буруутгавал улам уурла.",
    ],
  },
};

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter((l) => l.length >= 2)
    .slice(0, 40);

const DEFAULT_RUBRIC: Record<"interviewer" | "service", { label: string; weight: number }[]> = {
  interviewer: [
    { label: "Асуулт бүрт тодорхой, бүрэн хариулсан", weight: 3 },
    { label: "Жишээ, туршлагаар баталсан", weight: 2 },
    { label: "Байгууллагын мэдээлэл, журмыг зөв хэлсэн", weight: 2 },
    { label: "Итгэлтэй, эелдэг харилцсан", weight: 1 },
  ],
  service: [
    { label: "Мэндэлж, эелдэг угтсан", weight: 1 },
    { label: "Хэрэгцээг асууж тодруулсан", weight: 2 },
    { label: "Мэдээллийг үнэн зөв өгсөн", weight: 3 },
    { label: "Шийдэл, дараагийн алхмыг тодорхой хэлсэн", weight: 2 },
    { label: "Тайван, хүндэтгэлтэй харилцсан", weight: 1 },
  ],
};

export function buildStudioPack(input: StudioInput): CoachPack {
  const role = ROLE[input.role];
  const mood = MOOD[input.mood];
  const interviewer = input.role === "interviewer" || input.role === "colleague";
  const facts = lines(input.knowledge);
  const questions = input.questions.filter(Boolean);
  const org = input.orgName || "байгууллага";

  const rubricSource = input.rubric.length ? input.rubric : DEFAULT_RUBRIC[interviewer ? "interviewer" : "service"];
  const rubric: RubricItem[] = rubricSource.map((r, i) => ({ id: `r${i + 1}`, label: r.label, weight: r.weight }));

  const questionRules = questions.length
    ? interviewer
      ? [
          "Доорх АСУУЛТУУДЫГ яг энэ дарааллаар, нэг удаад нэгийг асуу. Ажилтан хариулсны дараа товч хүлээн авч (жишээ нь «За, ойлголоо»), дараагийн асуулт руу шилж.",
          "Хариулт бүрхэг, дутуу бол нэг удаа тодруулж асуу. Дараа нь цааш үргэлжлүүл.",
          "Асуултын хариуг өөрөө бүү хэл, бүү зөвлө.",
          "Бүх асуултыг асууж, сүүлчийнх нь хариултыг сонссоны дараа талархаад яриаг дуусга ([END]).",
        ]
      : [
          "Ярианы явцад доорх АСУУЛТУУДЫГ өөрийнхөөрөө, байгалийн жамаар, нэг нэгээр нь асуу (дараалал нь ойролцоо байж болно).",
          "Асуулт бүрт ажилтан хариулсны дараа л дараагийнх руу шилж. Бүгдийг асууж, хангалттай хариулт авсны дараа яриаг дуусга ([END]).",
        ]
    : ["Дүрийнхээ зорилгод хүрэх хүртэл ярь. Асуудал шийдэгдсэн бол талархаад дуусга ([END])."];

  const opening =
    input.opening ||
    (interviewer
      ? `Сайн байна уу, намайг ${input.personaName} гэдэг. ${questions[0] ? `Эхлээд асууя: ${questions[0]}` : "Ярилцлагаа эхэлье."}`
      : input.mood === "angry"
        ? "Сайн байна уу. Би танай үйлчилгээнд үнэхээр сэтгэл дундуур байна!"
        : "Сайн байна уу, нэг юм асуух гэсэн юм.");

  return {
    id: "",
    kind: "custom",
    studio: true,
    title: input.title,
    subtitle: input.situation ? input.situation.slice(0, 120) : `${input.personaName} · ${mood.text}`,
    icon: role.icon,
    traineeRole: input.traineeRole || "шинэ ажилтан",
    defaultMode: input.mode,
    language: "mn",
    gender: input.gender,
    maxSec: input.timeLimitMin * 60,
    brief:
      (interviewer
        ? `${input.personaName} танаас ${questions.length || "хэд хэдэн"} асуулт асууна. Тодорхой, жишээтэй хариулаарай.`
        : `${input.personaName} тантай ярилцана. Хэрэгцээг нь тодруулж, зөв мэдээлэл өгч, шийдэл санал болгоорой.`) +
      ` Хугацаа: ${input.timeLimitMin} минут.`,
    persona: {
      name: input.personaName,
      age: input.age,
      description: `${org}-д ${role.who}. Зан төлөв: ${mood.text}.`,
    },
    situation: input.situation || `${role.who} ${input.traineeRole}-тай ярилцаж байна.`,
    goal: role.goal,
    hidden: [],
    rules: [...mood.rules, ...questionRules],
    opening,
    openingEmotion: mood.emotion,
    fillers: ["Ммм...", "За..."],
    facts: facts.length ? facts : undefined,
    rubric,
    questions: questions.length ? questions : undefined,
    gradingNotes: [
      questions.length ? `Асуулт бүрт ажилтан хэрхэн хариулсныг тусад нь анхаар:\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}` : "",
      facts.length ? "Ажилтны хэлсэн мэдээллийг БАЙГУУЛЛАГЫН МЭДЭЭЛЭЛ-тэй тулгаж шалга." : "",
    ]
      .filter(Boolean)
      .join("\n"),
    orgName: input.orgName || undefined,
  };
}

/** Weighted score from rubric results: yes = 1, partial = ½, no = 0. */
export function weightedScore(rubric: RubricItem[], results: { id: string; result: "yes" | "partial" | "no" }[]): number | null {
  let total = 0;
  let got = 0;
  for (const item of rubric) {
    const r = results.find((x) => x.id === item.id);
    if (!r) continue;
    const w = item.weight ?? 1;
    total += w;
    got += w * (r.result === "yes" ? 1 : r.result === "partial" ? 0.5 : 0);
  }
  return total > 0 ? Math.round((got / total) * 100) : null;
}
