import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ApiError, Errors } from "@/lib/api/http";
import { getConfig } from "@/lib/config";
import { speak, voiceFor } from "@/lib/speech/features";

/**
 * «Сорил» (formerly «Шүүлэг»): the learner uploads study material (photos, PDF,
 * notes), Claude writes an exam from it (multiple choice, written answers,
 * clinical case problems), grades the answers like an examiner and suggests
 * what to study next. Stateless: the client keeps the questions (with their
 * answer keys) between generate and grade.
 *
 * `role` tailors the examiner and the questions to who is practising:
 * a student, a doctor, a nurse or an ambulance (EMS) worker.
 */

const MODEL = "claude-opus-5-5";

export const MAX_QUIZ_BYTES = 25 * 1024 * 1024;

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain"] as const;

export const QuizFileSchema = z.object({
  name: z.string().max(200),
  mediaType: z.enum(MEDIA_TYPES),
  data: z.string().min(1), // base64
});

export const LEARNER_ROLES = ["student", "doctor", "nurse", "ems", "teacher", "service", "manager", "learner", "health", "dispatcher"] as const;
export type LearnerRole = (typeof LEARNER_ROLES)[number];
const RoleSchema = z.enum(LEARNER_ROLES).default("student");

export const QUESTION_KINDS = ["choice", "open", "case"] as const;

export const GenerateInputSchema = z.object({
  files: z.array(QuizFileSchema).max(10).default([]),
  notes: z.string().max(20_000).default(""),
  count: z.number().int().min(3).max(15).default(5),
  /** Topics to concentrate on (weak points from a previous attempt). */
  focus: z.array(z.string().max(300)).max(10).default([]),
  /** Question types to include: choice (test), open (written), case (clinical case problem). */
  types: z.array(z.enum(QUESTION_KINDS)).min(1).max(3).default(["open", "choice"]),
  role: RoleSchema,
  /** Prompts of the previous version: write a new variant without repeating them. */
  avoid: z.array(z.string().max(2_000)).max(15).default([]),
});

const QuestionSchema = z.object({
  id: z.string(),
  kind: z.enum(QUESTION_KINDS),
  prompt: z.string(),
  /** Answer options for "choice"; empty for "open". */
  options: z.array(z.string()),
  /** What a full answer must contain (the examiner's checklist). */
  keyPoints: z.array(z.string()),
  modelAnswer: z.string(),
});

const QuizSchema = z.object({
  title: z.string(),
  summary: z.string(),
  questions: z.array(QuestionSchema),
});

export const GradeInputSchema = z.object({
  title: z.string().max(500),
  summary: z.string().max(5_000),
  questions: z.array(QuestionSchema).min(1).max(15),
  answers: z.array(z.string().max(5_000)),
  role: RoleSchema,
});

const GradeSchema = z.object({
  score: z.number().describe("0-100"),
  verdict: z.string(),
  items: z.array(
    z.object({
      score: z.number().describe("0-10"),
      status: z.enum(["correct", "partial", "wrong", "blank"]),
      feedback: z.string(),
      missing: z.array(z.string()),
      mistakes: z.array(z.string()),
    }),
  ),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  studyNext: z.array(z.object({ topic: z.string(), why: z.string() })),
});

export const ExplainInputSchema = z.object({
  topic: z.string().max(300),
  why: z.string().max(1_000).default(""),
  title: z.string().max(500).default(""),
  summary: z.string().max(5_000).default(""),
  role: RoleSchema,
});

const LessonSchema = z.object({
  title: z.string(),
  lesson: z.string(),
  keyFacts: z.array(z.string()),
  selfCheck: z.array(z.object({ question: z.string(), answer: z.string() })),
});

export type Quiz = z.infer<typeof QuizSchema>;
export type Grade = z.infer<typeof GradeSchema>;
export type Lesson = z.infer<typeof LessonSchema>;

/** Who is practising: the examiner persona, how to address the learner and what to test. */
const PROFILES: Record<LearnerRole, { examiner: string; who: string; whoGen: string; whoDat: string; whoWith: string; focus: string }> = {
  student: {
    examiner: "Монголын анагаахын их сургуулийн туршлагатай багш, шалгалт авагч",
    who: "оюутан",
    whoGen: "оюутны",
    whoDat: "оюутанд",
    whoWith: "оюутантай",
    focus: "суурь ойлголт, эмнэлзүйн сэтгэлгээ, OSCE болон шалгалтад бэлтгэх",
  },
  doctor: {
    examiner: "клиникийн туршлагатай ахлах эмч, резидент эмч нарын сургагч",
    who: "эмч",
    whoGen: "эмчийн",
    whoDat: "эмчид",
    whoWith: "эмчтэй",
    focus: "ялган оношлох, эмчилгээний шийдвэр, эмнэлзүйн заавар, эмийн тун ба эрсдэл, багийг удирдах",
  },
  nurse: {
    examiner: "туршлагатай ахлах сувилагч, сувилахуйн сургагч багш",
    who: "сувилагч",
    whoGen: "сувилагчийн",
    whoDat: "сувилагчид",
    whoWith: "сувилагчтай",
    focus: "сувилахуйн үнэлгээ, эмийг аюулгүй өгөх, амин үзүүлэлтийг хянах, өөрчлөлтийг эмчид мэдээлэх, эрх хэмжээгээ мэдэх, өвчтөнтэй харилцах",
  },
  ems: {
    examiner: "түргэн тусламжийн туршлагатай ахлах эмч, яаралтай тусламжийн сургагч",
    who: "түргэн тусламжийн ажилтан",
    whoGen: "түргэн тусламжийн ажилтны",
    whoDat: "түргэн тусламжийн ажилтанд",
    whoWith: "түргэн тусламжийн ажилтантай",
    focus: "хэргийн газрын аюулгүй байдал, ABCDE үнэлгээ, тогтворжуулалт, хугацаа, тээвэрлэх шийдвэр, эмнэлэгт хүлээлгэн өгөх",
  },
  teacher: {
    examiner: "туршлагатай арга зүйч багш, шинэ багш нарын зөвлөгч",
    who: "багш",
    whoGen: "багшийн",
    whoDat: "багшид",
    whoWith: "багштай",
    focus: "хичээлийн агуулга, заах арга, анги удирдлага, сурагч ба эцэг эхтэй харилцах",
  },
  service: {
    examiner: "үйлчилгээний байгууллагын туршлагатай сургагч, ахлах ажилтан",
    who: "үйлчилгээний ажилтан",
    whoGen: "үйлчилгээний ажилтны",
    whoDat: "үйлчилгээний ажилтанд",
    whoWith: "үйлчилгээний ажилтантай",
    focus: "байгууллагын бүтээгдэхүүн, үнэ, журам, үйлчлүүлэгчтэй харилцах, гомдол шийдвэрлэх",
  },
  manager: {
    examiner: "байгууллагын удирдлагын туршлагатай зөвлөх",
    who: "менежер",
    whoGen: "менежерийн",
    whoDat: "менежерт",
    whoWith: "менежертэй",
    focus: "байгууллагын журам, ажилтныг сургах, үйлчилгээний чанар, шийдвэр гаргах",
  },
  learner: {
    examiner: "туршлагатай багш, карьерын зөвлөх",
    who: "суралцагч",
    whoGen: "суралцагчийн",
    whoDat: "суралцагчид",
    whoWith: "суралцагчтай",
    focus: "материалын гол ойлголт, бодит амьдрал, ажилд хэрэглэх",
  },
  health: {
    examiner: "клиникийн туршлагатай ахлах эмч, сургагч",
    who: "эрүүл мэндийн ажилтан",
    whoGen: "эрүүл мэндийн ажилтны",
    whoDat: "эрүүл мэндийн ажилтанд",
    whoWith: "эрүүл мэндийн ажилтантай",
    focus: "эмнэлзүйн сэтгэлгээ, аюулгүй байдал, өвчтөнтэй харилцах",
  },
  dispatcher: {
    examiner: "яаралтай дуудлагын төвийн туршлагатай ахлах ажилтан, сургагч",
    who: "дуудлага хүлээн авагч",
    whoGen: "дуудлага хүлээн авагчийн",
    whoDat: "дуудлага хүлээн авагчид",
    whoWith: "дуудлага хүлээн авагчтай",
    focus: "байршил тодруулах, нөхцөлийг ангилах, утсаар заавар өгөх, тайван харилцаа",
  },
};

function systemPrompt(role: LearnerRole): string {
  const p = PROFILES[role];
  return `Чи ${p.examiner}. ${p.whoWith} монголоор, ойлгомжтой, найрсаг боловч шударга харьцана. Асуулт, тайлбараа ${p.whoGen} өдөр тутмын ажилд тулгарах нөхцөлтэй холбо (${p.focus}). Эмнэлзүйн мэдээллийг зөвхөн нотолгоонд суурилж хэлнэ; эх материал буруу бол зөвийг нь хэлнэ.`;
}

const KIND_RULES: Record<(typeof QUESTION_KINDS)[number], string> = {
  choice: `kind "choice" (тест): 4 сонголттой асуулт; options-д 4 сонголт, ганц нь зөв. modelAnswer-д зөв сонголтын текстийг яг хэвээр нь, keyPoints-д яагаад зөв болохыг бич.`,
  open: `kind "open" (өгүүлбэрээр): өөрийн үгээр 2-5 өгүүлбэрээр хариулах нээлттэй асуулт; options хоосон.`,
  case: `kind "case" (кейс бодлого): prompt-ыг "Тохиолдол:" гэж эхлүүлж 3-6 өгүүлбэрээр бодит нөхцөл (нас, хүйс, зовиур, үзлэг, амин үзүүлэлт эсвэл шинжилгээний тоо) бичээд, дараа нь шинэ мөрөнд "Асуулт:" гэж 1-2 асуулт тавь (онош, дараагийн алхам, тооцоо, эрэмбэлэлт г.м.). prompt нийт 700 тэмдэгтээс хэтрэхгүй; options хоосон.`,
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = getConfig().ANTHROPIC_API_KEY;
  if (!apiKey) throw new ApiError(503, "quiz_unavailable", "Шүүлэг одоогоор ажиллахгүй байна (AI тохируулаагүй).");
  // Explicit base URL: never inherit ANTHROPIC_BASE_URL from the host environment.
  client ??= new Anthropic({ apiKey, maxRetries: 1, baseURL: "https://api.anthropic.com" });
  return client;
}

async function ask<T extends z.ZodType>(schema: T, content: Anthropic.Beta.BetaContentBlockParam[], maxTokens: number, role: LearnerRole): Promise<z.infer<T>> {
  try {
    const response = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt(role),
      messages: [{ role: "user", content }],
      output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal") throw Errors.badRequest("AI энэ материалаар ажиллахаас татгалзлаа. Өөр материал оруулна уу.");
    if (response.stop_reason === "max_tokens" || !response.parsed_output) throw new ApiError(502, "quiz_bad_response", "AI-н хариу дутуу ирлээ. Дахин оролдоно уу.");
    return response.parsed_output as z.infer<T>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Anthropic.RateLimitError) throw new ApiError(429, "rate_limited", "AI түр завгүй байна. Хэдэн секундын дараа дахин оролдоно уу.");
    if (error instanceof Anthropic.BadRequestError) {
      console.error("[quiz] Anthropic 400:", error.message);
      // Account problems also come back as 400: say so instead of blaming the learner's file.
      if (/credit balance/i.test(error.message)) {
        throw new ApiError(503, "quiz_unavailable", "AI үйлчилгээний эрх (кредит) дууссан байна. Админ Anthropic Console → Plans & Billing-ээс цэнэглэнэ үү.");
      }
    }
    if (error instanceof Anthropic.BadRequestError) throw Errors.badRequest("Файлыг уншиж чадсангүй. Зураг тод, PDF гэмтэлгүй эсэхийг шалгана уу.");
    if (error instanceof Anthropic.APIConnectionError) throw new ApiError(502, "quiz_network", "AI-д холбогдож чадсангүй. Дахин оролдоно уу.");
    throw error;
  }
}

function materialBlocks(input: z.infer<typeof GenerateInputSchema>): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const file of input.files) {
    if (file.mediaType === "application/pdf") {
      blocks.push({ type: "document", title: file.name, source: { type: "base64", media_type: "application/pdf", data: file.data } });
    } else if (file.mediaType === "text/plain") {
      blocks.push({ type: "document", title: file.name, source: { type: "text", media_type: "text/plain", data: Buffer.from(file.data, "base64").toString("utf8") } });
    } else {
      blocks.push({ type: "image", source: { type: "base64", media_type: file.mediaType, data: file.data } });
    }
  }
  if (input.notes.trim()) blocks.push({ type: "text", text: `Хэрэглэгчийн оруулсан тэмдэглэл / сэдэв:\n${input.notes.trim()}` });
  return blocks;
}

export async function generateQuiz(input: z.infer<typeof GenerateInputSchema>): Promise<Quiz> {
  const material = materialBlocks(input);
  if (material.length === 0) throw Errors.badRequest("Зураг, файл эсвэл сэдвээ оруулна уу.");
  const p = PROFILES[input.role];
  const types = [...new Set(input.types)];
  const focus = input.focus.length ? `\nӨмнөх оролдлогод сул байсан сэдвүүдэд илүү анхаар: ${input.focus.join("; ")}.` : "";
  const avoid = input.avoid.length
    ? `\nЭнэ бол шинэ хувилбар: өмнөх хувилбарын дараах асуултуудыг давтахгүй, ижил сэдэв, ижил түвшний өөр асуулт бэлд:\n${input.avoid.map((a) => `- ${a.slice(0, 300)}`).join("\n")}`
    : "";
  const quiz = await ask(
    QuizSchema,
    [
      ...material,
      {
        type: "text",
        text: `Дээрх материалыг (зураг, файл, тэмдэглэл) анхааралтай уншаад, ${p.whoGen} мэдлэг, ур чадварыг шалгах ${input.count} асуулт бэлд.${focus}${avoid}

Асуултын төрлүүд (зөвхөн эдгээрийг ашиглаж, тоог нь ойролцоогоор тэнцүү хуваа):
${types.map((t) => `- ${KIND_RULES[t]}`).join("\n")}

- Асуултууд энэ материалд суурилна. Цээжлэхээс гадна ойлголт, эмнэлзүйн хэрэглээг шалгана; нөхцөл, жишээг ${p.whoGen} ажлын орчноос ав.
- keyPoints: бүрэн хариултад заавал байх 2-5 гол санаа (шалгагчийн жагсаалт).
- modelAnswer: товч, зөв жишиг хариулт.
- id: "q1", "q2" гэх мэт.
- title: материалын сэдвийн товч нэр. summary: материалын гол агуулгыг 3-6 өгүүлбэрээр (дараа нь дүгнэхэд ашиглана).
- Материал уншигдахгүй эсвэл хоосон бол хэрэглэгчийн тэмдэглэлд суурилж асуул.
Бүгдийг монголоор бич.`,
      },
    ],
    16_000,
    input.role,
  );
  const allowed = new Set<string>(types);
  return {
    ...quiz,
    questions: quiz.questions
      .slice(0, input.count)
      .map((q, i) => {
        // A kind that was not asked for, or a test without options, becomes a written answer.
        let kind = allowed.has(q.kind) ? q.kind : allowed.has("open") ? "open" : types[0];
        if (kind === "choice" && q.options.length < 2) kind = "open";
        return { ...q, id: `q${i + 1}`, kind, options: kind === "choice" ? q.options : [] };
      }),
  };
}

export async function gradeQuiz(input: z.infer<typeof GradeInputSchema>): Promise<Grade> {
  const p = PROFILES[input.role];
  const sheet = input.questions
    .map((q, i) => {
      const options = q.options.length ? `\nСонголтууд: ${q.options.map((o, j) => `${String.fromCharCode(65 + j)}) ${o}`).join(" | ")}` : "";
      return `### Асуулт ${i + 1}: ${q.prompt}${options}
Гол санаанууд: ${q.keyPoints.join("; ")}
Жишиг хариулт: ${q.modelAnswer}
${q.kind === "case" ? "Төрөл: кейс бодлого (үндэслэл, дараалал, эрэмбийг үнэл)\n" : ""}Хариулт: ${(input.answers[i] ?? "").trim() || "(хариулаагүй)"}`;
    })
    .join("\n\n");
  const grade = await ask(
    GradeSchema,
    [
      {
        type: "text",
        text: `Сэдэв: ${input.title}
Материалын товч: ${input.summary}

${sheet}

Шалгагчийн хувиар асуулт бүрийг дүгнэ:
- items: асуулт бүрт дарааллаар нэг. score 0-10 (хэсэгчилсэн оноо өг), status (correct / partial / wrong / blank).
- missing: дутуу хэлсэн гол санаанууд. mistakes: буруу хэлсэн зүйл бүрийг "Та ... гэж хэлсэн, зөв нь ..." хэлбэрээр.
- feedback: ${p.whoDat} хандсан 1-3 өгүүлбэр.
- Утгаараа зөв бол үг өөр байсан ч зөвд тооц. Хариулаагүй бол blank, 0 оноо.
- score: нийт 0-100. verdict: нэг өгүүлбэрийн ерөнхий дүгнэлт.
- strengths, weaknesses: тус бүр 1-4 зүйл.
- studyNext: цаашид судлах 2-4 тодорхой сэдэв, яагаад (why) гэдгийг ${p.whoGen} алдаатай холбож бич.
Бүгдийг монголоор бич.`,
      },
    ],
    16_000,
    input.role,
  );
  return { ...grade, score: Math.round(Math.max(0, Math.min(100, grade.score))) };
}

export async function explainTopic(input: z.infer<typeof ExplainInputSchema>): Promise<Lesson> {
  const p = PROFILES[input.role];
  return ask(
    LessonSchema,
    [
      {
        type: "text",
        text: `${p.who[0].toUpperCase()}${p.who.slice(1)} "${input.title}" сэдвийн шалгалт өгөөд дараах зүйлийг цааш судлах хэрэгтэй гэж гарсан.
Сэдэв: ${input.topic}
Шалтгаан: ${input.why}
Материалын товч: ${input.summary}

Энэ сэдвээр богино хичээл бэлд:
- lesson: 3-5 догол мөр, энгийн ойлгомжтой тайлбар, ${p.whoGen} ажилд тулгардаг эмнэлзүйн жишээтэй. Догол мөрүүдийг хоосон мөрөөр тусгаарла, markdown тэмдэг бүү ашигла.
- keyFacts: цээжлэх 3-6 гол баримт.
- selfCheck: өөрийгөө шалгах 2-3 асуулт, хариутай.
Бүгдийг монголоор бич.`,
      },
    ],
    8_000,
    input.role,
  );
}

/** Spoken examiner lines, cached by text: questions are re-heard and each synthesis costs TTS credits. */
const speechCache = new Map<string, Uint8Array<ArrayBuffer>>();

export const SpeakInputSchema = z.object({ text: z.string().trim().min(1).max(1_200) });

/** The examiner's voice (male TTS voice, matching the examiner avatar) as 16 kHz WAV. */
export async function examinerSpeech(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const key = `${getConfig().TTS_PROVIDER}:${voiceFor("male")}:${text}`;
  const cached = speechCache.get(key);
  if (cached) return cached;
  const wav = await speak(text, "male");
  if (speechCache.size >= 300) speechCache.delete(speechCache.keys().next().value!);
  speechCache.set(key, wav);
  return wav;
}
