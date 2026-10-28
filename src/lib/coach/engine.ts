import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ApiError, Errors } from "@/lib/api/http";
import { getConfig } from "@/lib/config";
import { MAX_STT_BYTES, isSpeechWav, transcribe } from "@/lib/speech/chimege";
import { synthesizeElevenLabs } from "@/lib/speech/elevenlabs";
import { speak, voiceFor } from "@/lib/speech/features";
import { weightedScore } from "./studio";
import { COACH_EMOTIONS, type CoachDebrief, type CoachDifficulty, type CoachEmotion, type CoachLine, type CoachMode, type CoachPack, type TurnEvent } from "./types";

/**
 * AI дасгалжуулагч engine: the persona's replies (streamed sentence by
 * sentence so the voice can start early), packs made from a company's own
 * material, and the debrief after a conversation.
 */

const TURN_MODEL = "claude-sonnet-5-5"; // replies: speed matters
const PACK_MODEL = "claude-sonnet-5-5";
const DEBRIEF_MODEL = "claude-opus-5-5"; // grading: quality matters

let client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = getConfig().ANTHROPIC_API_KEY;
  if (!apiKey) throw new ApiError(503, "coach_unavailable", "AI дасгалжуулагч одоогоор ажиллахгүй байна (AI тохируулаагүй).");
  // Explicit base URL: never inherit ANTHROPIC_BASE_URL from the host environment.
  client ??= new Anthropic({ apiKey, maxRetries: 1, baseURL: "https://api.anthropic.com" });
  return client;
}

function aiError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof Anthropic.RateLimitError) throw new ApiError(429, "rate_limited", "AI түр завгүй байна. Хэдэн секундын дараа дахин оролдоно уу.");
  if (error instanceof Anthropic.BadRequestError) {
    console.error("[coach] Anthropic 400:", error.message);
    if (/credit balance/i.test(error.message)) {
      throw new ApiError(503, "coach_unavailable", "AI үйлчилгээний эрх (кредит) дууссан байна. Админ Anthropic Console → Plans & Billing-ээс цэнэглэнэ үү.");
    }
    throw Errors.badRequest("Материалыг уншиж чадсангүй. Зураг тод, PDF гэмтэлгүй эсэхийг шалгана уу.");
  }
  if (error instanceof Anthropic.APIConnectionError) throw new ApiError(502, "coach_network", "AI-д холбогдож чадсангүй. Дахин оролдоно уу.");
  throw error;
}

const list = (xs: string[] | undefined) => (xs?.length ? xs.map((x) => `- ${x}`).join("\n") : "- (байхгүй)");

export const DIFFICULTY_TEXT: Record<CoachDifficulty, string> = {
  easy: "ХЯЛБАР: дүр тайван, хамтрах хүсэлтэй; ажилтны жижиг алдааг уучилна.",
  medium: "ДУНД: дүр дээрх тодорхойлолтоороо; тодорхой бус хариултад дахин асууна.",
  hard: "ХЭЦҮҮ: дүр илүү сэтгэл хөдлөлтэй, тэвчээргүй; ажилтныг тасалж ярина, бүрхэг хариулт, алдааг шууд барина, тайвшрахад удаан.",
};

function turnSystem(p: CoachPack, difficulty: CoachDifficulty, mode: CoachMode): string {
  const where = mode === "audio" ? "Утсаар ярьж байна (ажилтан чамайг харахгүй)." : "Ажилтны өмнө биечлэн ирээд ярьж байна.";
  const lang =
    p.language === "en"
      ? "Чи ЗӨВХӨН англиар, энгийн, байгалийн ярианы хэлээр (A2–B1) ярина."
      : "Монголоор, ярианы хэлээр ярина.";
  return `Чи хүнтэй харьцдаг ажилтны дадлагын симулятор. Ажилтан: ${p.traineeRole}.
Чи ЗӨВХӨН доорх дүрд тоглоно. Дүрээсээ хэзээ ч бүү гар.

ДҮР: ${p.persona.name}, ${p.persona.age} настай. ${p.persona.description}
НӨХЦӨЛ: ${p.situation}
ЗОРИЛГО: ${p.goal}
ХҮНДИЙН ЗЭРЭГ: ${DIFFICULTY_TEXT[difficulty]}

АСУУВАЛ Л ХЭЛЭХ (өөрөө бүү дэлгэ):
${list(p.hidden)}

ДҮРИЙН ЗАН БАЙДАЛ:
${list(p.rules)}
${p.facts?.length ? `\nБАЙГУУЛЛАГЫН МЭДЭЭЛЭЛ (чи үйлчлүүлэгч тул үүнийг нарийн мэдэхгүй; асуух сэдэв, ажилтны хариу зөв эсэхийг мэдрэхэд ашигла):\n${list(p.facts)}\n` : ""}${p.questions?.length ? `\nАСУУЛТУУД (менежерийн тогтоосон, заавал бүгдийг асуух):\n${p.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n` : ""}
ЕРӨНХИЙ ДҮРЭМ:
- ${where} ${lang} Богино: ихэвчлэн 1–2 өгүүлбэр, хэзээ ч 3-аас олон биш.
- Жинхэнэ хүн шиг: сэтгэл хөдлөлдөө тохирсон, заримдаа тасархай, давталттай. Жагсаалт, тайлбар, албан хэллэг бүү хэрэглэ.
- Ажилтан тодорхой асуухгүй бол мэдээллээ бүтнээр нь бүү хэл. Ерөнхий асуултад ерөнхий хариул.
- Чи багш биш: зөвлөгөө, үнэлгээ бүү өг. AI гэдгээ бүү хэл.
- Ажилтны үгийг дуу танигч бичсэн тул алдаатай байж болно: утгыг нь таамаглаж хариул.
- «(чимээгүй)» гэвэл ажилтан хэдэн секунд дуугүй байсан. Дүрдээ тохируулж хариул.
- Ажилтны мөр бүрийн эхэнд [N сек] гэж дадлагын цаг бичигдсэн. Цагаас хамаарсан дүрмийг үүгээр баримтал. Өөрөө цаг бүү бич.
- Хариултын ЭХЭНД заавал нэг таг: ${COACH_EMOTIONS.map((e) => `[${e}]`).join(" ")}.
- Яриа байгалийн жамаар дууссан бол хариултын ТӨГСГӨЛД [END] гэж бич.
- Эхний тагаас бусад таг, од, хаалт, emoji бүү бич.`;
}

/** History → alternating user/assistant messages (the trainee is the user). */
function buildMessages(p: CoachPack, mode: CoachMode, history: CoachLine[]): Anthropic.MessageParam[] {
  const start = mode === "audio" ? "(Ажилтан утсаа авлаа)" : "(Ажилтан тантай уулзлаа)";
  const msgs: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: `[0 сек] ${start}` }];
  for (const h of history) {
    const role = h.role === "ai" ? "assistant" : "user";
    const text = role === "user" ? `[${Math.round(h.t)} сек] ${h.text}` : h.text;
    const last = msgs[msgs.length - 1];
    if (last.role === role) last.content += `\n${text}`;
    else msgs.push({ role, content: text });
  }
  if (msgs[msgs.length - 1].role !== "user") msgs.push({ role: "user", content: "(чимээгүй)" });
  return msgs;
}

const isEmotion = (v: string): v is CoachEmotion => (COACH_EMOTIONS as readonly string[]).includes(v);

/** Cuts the streamed reply into sentences; strips the leading emotion tag and [END]. */
export class SpeechParser {
  private buf = "";
  private tagDone = false;
  private ended = false;
  private full = "";
  constructor(private readonly emit: (event: TurnEvent) => void) {}

  push(delta: string) {
    this.buf += delta;
    if (!this.tagDone) {
      const m = this.buf.match(/^\s*\[([a-zA-Z_]+)\]\s*/);
      if (m) {
        const e = m[1].toLowerCase();
        this.emit({ t: "emo", v: isEmotion(e) ? e : "calm" });
        this.buf = this.buf.slice(m[0].length);
        this.tagDone = true;
      } else if (this.buf.length > 16 || /^\s*[^\s[]/.test(this.buf)) {
        this.tagDone = true;
      } else return;
    }
    this.flush(false);
  }

  private flush(final: boolean) {
    if (/\[END\]/i.test(this.buf)) {
      this.ended = true;
      this.buf = this.buf.replace(/\[END\]/gi, " ");
    }
    const re = /^([\s\S]*?[.!?…]+["»”)]*)(\s+)/;
    let m: RegExpMatchArray | null;
    while ((m = this.buf.match(re))) {
      this.say(m[1]);
      this.buf = this.buf.slice(m[0].length);
    }
    if (final) {
      this.say(this.buf);
      this.buf = "";
    }
  }

  private say(s: string) {
    s = s.replace(/\[[^\]]*\]/g, "").replace(/[*_#]/g, "").replace(/\s+/g, " ").trim();
    if (!s || !/[\p{L}\p{N}]/u.test(s)) return;
    this.full += (this.full ? " " : "") + s;
    this.emit({ t: "say", text: s });
  }

  end() {
    this.flush(true);
    if (this.ended) this.emit({ t: "end" });
    this.emit({ t: "done", text: this.full });
  }
}

export async function streamTurn(
  pack: CoachPack,
  input: { difficulty: CoachDifficulty; mode: CoachMode; history: CoachLine[] },
  emit: (event: TurnEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const parser = new SpeechParser(emit);
  try {
    const stream = getClient().messages.stream(
      {
        model: TURN_MODEL,
        max_tokens: 400,
        output_config: { effort: "low" },
        system: [{ type: "text", text: turnSystem(pack, input.difficulty, input.mode), cache_control: { type: "ephemeral" } }],
        messages: buildMessages(pack, input.mode, input.history.slice(-40)),
      },
      { signal },
    );
    stream.on("text", (delta) => parser.push(delta));
    await stream.finalMessage();
  } catch (error) {
    if (signal?.aborted) return;
    aiError(error);
  }
  parser.end();
}

// ---------------------------------------------------------------------------
// Packs from a company's own material (PDF, photos, text)

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain"] as const;

export const CoachFileSchema = z.object({
  name: z.string().max(200),
  mediaType: z.enum(MEDIA_TYPES),
  data: z.string().min(1), // base64
});

export const CreatePackInputSchema = z.object({
  orgName: z.string().trim().max(120).default(""),
  /** What the persona is: a customer at the counter, a caller, a patient, a student... */
  persona: z.enum(["customer", "caller", "patient", "student", "buyer"]).default("customer"),
  mode: z.enum(["video", "audio"]).default("video"),
  files: z.array(CoachFileSchema).max(10).default([]),
  notes: z.string().max(20_000).default(""),
  /** Share with this team (the caller must own it); otherwise private. */
  teamId: z.string().uuid().nullable().default(null),
});

const PERSONA_TEXT: Record<z.infer<typeof CreatePackInputSchema>["persona"], string> = {
  customer: "ресепшн/үйлчилгээний цэг дээр биечлэн ирсэн үйлчлүүлэгч",
  caller: "call center руу утсаар залгаж буй харилцагч",
  patient: "эмнэлэгт ирсэн өвчтөн",
  student: "сургалтад хамрагдаж буй сурагч",
  buyer: "бараа сонирхож буй худалдан авагч",
};

const PackDraftSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  traineeRole: z.string(),
  brief: z.string(),
  persona: z.object({ name: z.string(), age: z.number().int(), gender: z.enum(["female", "male"]), description: z.string() }),
  situation: z.string(),
  goal: z.string(),
  hidden: z.array(z.string()),
  rules: z.array(z.string()),
  opening: z.string(),
  openingEmotion: z.enum(COACH_EMOTIONS),
  facts: z.array(z.string()),
  rubric: z.array(z.object({ id: z.string(), label: z.string() })),
});

function materialBlocks(input: z.infer<typeof CreatePackInputSchema>): Anthropic.Beta.BetaContentBlockParam[] {
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
  if (input.notes.trim()) blocks.push({ type: "text", text: `Байгууллагын оруулсан тэмдэглэл:\n${input.notes.trim()}` });
  return blocks;
}

/** Reads the company's material and writes a practice persona for its new staff. */
export async function draftPackFromMaterial(input: z.infer<typeof CreatePackInputSchema>): Promise<CoachPack> {
  const material = materialBlocks(input);
  if (material.length === 0) throw Errors.badRequest("Компанийн мэдээллээ (зураг, PDF эсвэл текст) оруулна уу.");
  const org = input.orgName || "энэ байгууллага";
  let draft: z.infer<typeof PackDraftSchema>;
  try {
    const response = await getClient().beta.messages.parse({
      model: PACK_MODEL,
      max_tokens: 8_000,
      messages: [
        {
          role: "user",
          content: [
            ...material,
            {
              type: "text",
              text: `Дээрх бол «${org}»-ын мэдээлэл. Шинэ ажилтныг сургах, шалгах зорилгоор дүрд тоглох ОНЦГОЙ НЭГ дадлага бэлд.
- Дүр: ${PERSONA_TEXT[input.persona]}. ${input.mode === "audio" ? "Утсаар ярина." : "Нүүр тулж ярина."}
- situation: материалд үндэслэсэн, бодит, нэг тодорхой хэрэгцээтэй нөхцөл (үнэ, нөхцөл, захиалга, гомдол г.м.). Ажилтан материалыг мэдэж байж л зөв хариулна.
- hidden: дүрийн өөрийнх нь мэдээлэл (нэр, нөхцөл, яг юу хүсэж байгаа), асуувал л хэлэх 3–5 зүйл.
- rules: 4–7 дүрэм: хэзээ тайвширах, хэзээ эргэлзэх/уурлах, ямар нэмэлт асуулт асуух, ажилтан буруу мэдээлэл өгвөл яах, хэзээ яриа дуусах ([END]).
- facts: материалаас ажилтны мэдэх ёстой 8–25 гол баримт (тоо, үнэ, цаг, журам), товч, материалд байгаа утгаар нь. ЗОХИОЖ БОЛОХГҮЙ.
- rubric: 5–7 шалгуур (id нь богино англи snake_case): мэндчилгээ, хэрэгцээг тодруулах, мэдээллийн үнэн зөв байдал, эелдэг харилцаа, шийдэл/дараагийн алхам.
- opening: дүрийн хамгийн эхний үг (1–2 өгүүлбэр, ярианы хэлээр).
- brief: ажилтанд харагдах 1–2 өгүүлбэр (дүрийн нууцыг бүү дэлгэ).
- traineeRole: «${org}»-ын ямар ажилтан дадлага хийх вэ (жишээ нь «Нарны эмнэлгийн ресепшний шинэ ажилтан»).
- title: богино нэр (жишээ нь «Үнийн асуулт», «Захиалгын гомдол»). subtitle: нөхцөлийн нэг мөр.
Бүх бичвэр монголоор.`,
            },
          ],
        },
      ],
      output_config: { effort: "medium", format: betaZodOutputFormat(PackDraftSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal") throw Errors.badRequest("AI энэ материалаар ажиллахаас татгалзлаа. Өөр материал оруулна уу.");
    if (!response.parsed_output) throw new ApiError(502, "coach_bad_response", "AI-н хариу дутуу ирлээ. Дахин оролдоно уу.");
    draft = response.parsed_output;
  } catch (error) {
    aiError(error);
  }
  const icons: Record<string, string> = { customer: "🛎️", caller: "🎧", patient: "🩺", student: "🎒", buyer: "🛍️" };
  return {
    id: "", // set when saved
    kind: "custom",
    title: draft.title,
    subtitle: draft.subtitle,
    icon: icons[input.persona] ?? "🏢",
    traineeRole: draft.traineeRole,
    defaultMode: input.mode,
    language: "mn",
    gender: draft.persona.gender,
    maxSec: 420,
    brief: draft.brief,
    persona: { name: draft.persona.name, age: draft.persona.age, description: draft.persona.description },
    situation: draft.situation,
    goal: draft.goal,
    hidden: draft.hidden,
    rules: draft.rules,
    opening: draft.opening,
    openingEmotion: draft.openingEmotion,
    fillers: ["Ммм...", "За..."],
    facts: draft.facts,
    rubric: draft.rubric.slice(0, 8),
    gradingNotes: "Ажилтны мэдээллийг БАЙГУУЛЛАГЫН МЭДЭЭЛЭЛ-тэй тулгаж шалга. Материалд байхгүй зүйлийг баттай хэлсэн бол алдаа.",
    orgName: input.orgName || undefined,
  };
}

// ---------------------------------------------------------------------------
// Debrief

const DebriefSchema = z.object({
  score: z.number().int(),
  summary: z.string(),
  rubric: z.array(z.object({ id: z.string(), label: z.string(), result: z.enum(["yes", "partial", "no"]), evidence: z.string() })),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  betterLines: z.array(z.object({ said: z.string(), better: z.string() })),
  factErrors: z.array(z.string()),
});

export async function gradeConversation(pack: CoachPack, input: { difficulty: CoachDifficulty; history: CoachLine[]; durationSec: number }): Promise<CoachDebrief> {
  const transcript = input.history.map((h) => `[${Math.round(h.t)}с ${h.role === "ai" ? pack.persona.name : "Ажилтан"}] ${h.text}`).join("\n");
  try {
    const response = await getClient().beta.messages.parse({
      model: DEBRIEF_MODEL,
      max_tokens: 12_000,
      system: `Чи «${pack.traineeRole}» ажилтнуудыг сургадаг туршлагатай, шударга сургагч. Монгол хэлээр, тодорхой, урам өгөхүйц боловч үнэнээр дүгнэнэ.
Дадлагын нөхцөл: ${pack.situation}
Дүр: ${pack.persona.name} — ${pack.persona.description}
Хүндийн зэрэг: ${DIFFICULTY_TEXT[input.difficulty]}
Шалгуурууд (id: тайлбар):
${pack.rubric.map((r) => `- ${r.id}: ${r.label}${r.weight && r.weight > 1 ? ` (ач холбогдол ${r.weight}/5)` : ""}`).join("\n")}
${pack.facts?.length ? `БАЙГУУЛЛАГЫН МЭДЭЭЛЭЛ:\n${list(pack.facts)}\n` : ""}${pack.gradingNotes ? `Тэмдэглэл: ${pack.gradingNotes}\n` : ""}
Заавар:
- rubric: шалгуур бүрийг дээрх id, label-аар нь yes / partial / no гэж үнэлж, evidence-д тэмдэглэлээс секундээр иш тат.
- score (0–100): шалгууруудын биелэлтэд тулгуурлана.
- strengths, improvements: 2–4 тодорхой зүйл. Хамгийн чухал алдааг эхэнд.
- betterLines: ажилтны хэлсэн 2–3 үгийг (said: яг хэлснээр нь) илүү сайн хувилбараар (better) сайжруул.
- factErrors: ажилтны өгсөн буруу эсвэл баталгаагүй мэдээлэл (байхгүй бол хоосон).
- Ажилтны үгийг дуу танигч бичсэн тул жижиг үсгийн алдааг бүү тооцоол.
- summary: 2–3 өгүүлбэр.`,
      messages: [{ role: "user", content: `Дадлагын үргэлжлэх хугацаа: ${input.durationSec} сек.\n\nТэмдэглэл:\n${transcript || "(яриа болоогүй)"}` }],
      output_config: { effort: "medium", format: betaZodOutputFormat(DebriefSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (!response.parsed_output) throw new ApiError(502, "coach_bad_response", "AI-н дүгнэлт дутуу ирлээ. Дахин оролдоно уу.");
    const d = response.parsed_output;
    // Studio packs: the manager's weights decide the score, so it can be explained line by line.
    const weighted = pack.studio ? weightedScore(pack.rubric, d.rubric) : null;
    return { ...d, score: Math.max(0, Math.min(100, Math.round(weighted ?? d.score))) };
  } catch (error) {
    aiError(error);
  }
}

// ---------------------------------------------------------------------------
// Voice

const speechCache = new Map<string, Uint8Array<ArrayBuffer>>();

/** The persona's voice (16 kHz WAV). English personas use ElevenLabs when it is configured. */
export async function coachSpeech(pack: CoachPack, text: string, emotion?: CoachEmotion): Promise<Uint8Array<ArrayBuffer>> {
  const c = getConfig();
  const english = pack.language === "en" && Boolean(c.ELEVENLABS_API_KEY);
  const key = `${english ? "el" : c.TTS_PROVIDER}:${pack.gender}:${emotion ?? ""}:${text}`;
  const cached = speechCache.get(key);
  if (cached) return cached;
  let wav: Uint8Array<ArrayBuffer>;
  if (english) {
    const voice = (pack.gender === "male" ? c.ELEVENLABS_VOICE_MALE : c.ELEVENLABS_VOICE_FEMALE) ?? voiceFor(pack.gender);
    wav = await synthesizeElevenLabs(text, voice);
  } else {
    wav = await speak(text, pack.gender, emotion);
  }
  if (speechCache.size >= 400) speechCache.delete(speechCache.keys().next().value!);
  speechCache.set(key, wav);
  return wav;
}

/** Trainee's voice → text. Mongolian via Chimege; English via ElevenLabs speech-to-text. */
export async function transcribeTrainee(wav: Uint8Array<ArrayBuffer>, language: "mn" | "en"): Promise<string> {
  if (wav.length > MAX_STT_BYTES) throw Errors.badRequest("Бичлэг 15 секундээс урт байна.");
  if (!isSpeechWav(wav)) throw Errors.badRequest("Дууны формат буруу байна (16 кГц WAV хүлээж байна).");
  if (language === "mn") return transcribe(wav);
  const c = getConfig();
  if (!c.ELEVENLABS_API_KEY) throw new ApiError(503, "stt_unavailable", "Англи яриа таних тохируулагдаагүй байна. Бичиж хариулна уу.");
  const form = new FormData();
  form.append("model_id", c.ELEVENLABS_STT_MODEL);
  form.append("language_code", "en");
  form.append("file", new Blob([wav], { type: "audio/wav" }), "answer.wav");
  let response: Response;
  try {
    response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": c.ELEVENLABS_API_KEY },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ApiError(502, "stt_network", "Яриа танигчид холбогдож чадсангүй.");
  }
  const body = (await response.json().catch(() => null)) as { text?: string } | null;
  if (!response.ok) {
    console.error(`[coach] ElevenLabs STT HTTP ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
    throw new ApiError(502, "stt_failed", "Англи яриаг таньж чадсангүй. Бичиж хариулна уу.");
  }
  return (body?.text ?? "").trim();
}
