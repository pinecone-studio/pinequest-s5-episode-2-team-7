import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ApiError, Errors } from "@/lib/api/http";
import { getConfig } from "@/lib/config";
import { speak, voiceFor } from "@/lib/speech/features";

/**
 * «Шүүлэг»: the student uploads study material (photos, PDF, notes), Claude
 * writes an exam from it, grades the answers like an examiner and suggests
 * what to study next. Stateless: the client keeps the questions (with their
 * answer keys) between generate and grade.
 */

const MODEL = "claude-opus-5-5";

export const MAX_QUIZ_BYTES = 25 * 1024 * 1024;

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain"] as const;

export const QuizFileSchema = z.object({
  name: z.string().max(200),
  mediaType: z.enum(MEDIA_TYPES),
  data: z.string().min(1), // base64
});

export const GenerateInputSchema = z.object({
  files: z.array(QuizFileSchema).max(10).default([]),
  notes: z.string().max(20_000).default(""),
  count: z.number().int().min(3).max(15).default(5),
  /** Topics to concentrate on (weak points from a previous attempt). */
  focus: z.array(z.string().max(300)).max(10).default([]),
});

const QuestionSchema = z.object({
  id: z.string(),
  kind: z.enum(["open", "choice"]),
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

const ROLE = `Чи Монголын анагаахын их сургуулийн туршлагатай багш, шалгалт авагч. Оюутантай монголоор, ойлгомжтой, найрсаг боловч шударга харьцана. Эмнэлзүйн мэдээллийг зөвхөн нотолгоонд суурилж хэлнэ; эх материал буруу бол зөвийг нь хэлнэ.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = getConfig().ANTHROPIC_API_KEY;
  if (!apiKey) throw new ApiError(503, "quiz_unavailable", "Шүүлэг одоогоор ажиллахгүй байна (AI тохируулаагүй).");
  // Explicit base URL: never inherit ANTHROPIC_BASE_URL from the host environment.
  client ??= new Anthropic({ apiKey, maxRetries: 1, baseURL: "https://api.anthropic.com" });
  return client;
}

async function ask<T extends z.ZodType>(schema: T, content: Anthropic.Beta.BetaContentBlockParam[], maxTokens: number): Promise<z.infer<T>> {
  try {
    const response = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: maxTokens,
      system: ROLE,
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
  if (input.notes.trim()) blocks.push({ type: "text", text: `Оюутны оруулсан тэмдэглэл / сэдэв:\n${input.notes.trim()}` });
  return blocks;
}

export async function generateQuiz(input: z.infer<typeof GenerateInputSchema>): Promise<Quiz> {
  const material = materialBlocks(input);
  if (material.length === 0) throw Errors.badRequest("Зураг, файл эсвэл сэдвээ оруулна уу.");
  const focus = input.focus.length ? `\nӨмнөх оролдлогод сул байсан сэдвүүдэд илүү анхаар: ${input.focus.join("; ")}.` : "";
  const quiz = await ask(
    QuizSchema,
    [
      ...material,
      {
        type: "text",
        text: `Дээрх материалыг (зураг, файл, тэмдэглэл) анхааралтай уншаад, оюутны мэдлэгийг шалгах ${input.count} асуулт бэлд.${focus}

- Асуултууд зөвхөн энэ материалд суурилна. Цээжлэхээс гадна ойлголт, эмнэлзүйн хэрэглээг шалгадаг асуулт оруул.
- Ихэнх нь нээлттэй (kind "open") асуулт байна; 1-2 нь 4 сонголттой (kind "choice", options-д сонголтууд, зөв нь аль гэдгийг keyPoints, modelAnswer-д бич). Нээлттэй асуултад options хоосон.
- keyPoints: бүрэн хариултад заавал байх 2-5 гол санаа (шалгагчийн жагсаалт).
- modelAnswer: товч, зөв жишиг хариулт.
- id: "q1", "q2" гэх мэт.
- title: материалын сэдвийн товч нэр. summary: материалын гол агуулгыг 3-6 өгүүлбэрээр (дараа нь дүгнэхэд ашиглана).
- Материал уншигдахгүй эсвэл хоосон бол оюутны тэмдэглэлд суурилж асуул.
Бүгдийг монголоор бич.`,
      },
    ],
    16_000,
  );
  return { ...quiz, questions: quiz.questions.slice(0, input.count).map((q, i) => ({ ...q, id: `q${i + 1}`, options: q.kind === "choice" ? q.options : [] })) };
}

export async function gradeQuiz(input: z.infer<typeof GradeInputSchema>): Promise<Grade> {
  const sheet = input.questions
    .map((q, i) => {
      const options = q.options.length ? `\nСонголтууд: ${q.options.map((o, j) => `${String.fromCharCode(65 + j)}) ${o}`).join(" | ")}` : "";
      return `### Асуулт ${i + 1}: ${q.prompt}${options}
Гол санаанууд: ${q.keyPoints.join("; ")}
Жишиг хариулт: ${q.modelAnswer}
Оюутны хариулт: ${(input.answers[i] ?? "").trim() || "(хариулаагүй)"}`;
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
- feedback: оюутанд хандсан 1-3 өгүүлбэр.
- Утгаараа зөв бол үг өөр байсан ч зөвд тооц. Хариулаагүй бол blank, 0 оноо.
- score: нийт 0-100. verdict: нэг өгүүлбэрийн ерөнхий дүгнэлт.
- strengths, weaknesses: тус бүр 1-4 зүйл.
- studyNext: цаашид судлах 2-4 тодорхой сэдэв, яагаад (why) гэдгийг оюутны алдаатай холбож бич.
Бүгдийг монголоор бич.`,
      },
    ],
    16_000,
  );
  return { ...grade, score: Math.round(Math.max(0, Math.min(100, grade.score))) };
}

export async function explainTopic(input: z.infer<typeof ExplainInputSchema>): Promise<Lesson> {
  return ask(
    LessonSchema,
    [
      {
        type: "text",
        text: `Оюутан "${input.title}" сэдвийн шалгалт өгөөд дараах зүйлийг цааш судлах хэрэгтэй гэж гарсан.
Сэдэв: ${input.topic}
Шалтгаан: ${input.why}
Материалын товч: ${input.summary}

Энэ сэдвээр богино хичээл бэлд:
- lesson: 3-5 догол мөр, энгийн ойлгомжтой тайлбар, эмнэлзүйн жишээтэй. Догол мөрүүдийг хоосон мөрөөр тусгаарла, markdown тэмдэг бүү ашигла.
- keyFacts: цээжлэх 3-6 гол баримт.
- selfCheck: өөрийгөө шалгах 2-3 асуулт, хариутай.
Бүгдийг монголоор бич.`,
      },
    ],
    8_000,
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
