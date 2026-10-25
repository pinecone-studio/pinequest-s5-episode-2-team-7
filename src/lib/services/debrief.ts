import "server-only";
import { z } from "zod";
import { Errors } from "@/lib/api/http";
import type { SessionData } from "@/lib/auth/session";
import { fallbackDebrief, type Debrief } from "@/lib/evaluation/debrief";
import { ChatModelProvider } from "@/lib/patient/providers/base";
import { getPatientProvider } from "@/lib/patient/providers";
import { getSessionView } from "./sessions";

const TIMEOUT_MS = 8_000;
const ATTEMPTS = 2;

const ModelDebrief = z.object({
  summary: z.string().trim().min(20).max(900),
  followUps: z.array(z.string().trim().min(8).max(300)).min(2).max(3),
});

const SYSTEM = [
  "Чи эрүүл мэндийн мэргэжилтнүүдийн дадлагын шүүлэгч багш. Бүх хариултаа монгол хэлээр (кирилл) бич.",
  "Өгөгдсөн JSON: ярилцлагын бичлэг, зөв онош, суралцагчийн онош, онош зөв эсэх, орхисон асуумжууд.",
  'Зөвхөн дараах JSON-оор хариул: {"summary": "3–4 өгүүлбэр бүхий дүгнэлт", "followUps": ["бодох асуулт", "бодох асуулт", "бодох асуулт"]}.',
  "summary: юуг сайн хийсэн, юуг орхисон, оношийн дүгнэлт. followUps: суралцагчийн цаашид бодох 2–3 асуулт (шинжилгээ, ялган онош, эмчилгээ).",
  "Оноо бүү тооцоол, бүү дурд. Зөвхөн өгөгдсөн баримтад тулгуурла, шинэ эмнэлзүйн баримт бүү зохио.",
].join("\n");

function isMongolian(text: string): boolean {
  const cyrillic = (text.match(/\p{Script=Cyrillic}/gu) ?? []).length;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  return letters > 0 && cyrillic / letters >= 0.6;
}

/** Pulls the JSON object out of a reply that may be wrapped in a code fence or prose. */
function parseReply(text: string): z.infer<typeof ModelDebrief> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = ModelDebrief.safeParse(JSON.parse(text.slice(start, end + 1)));
    if (!parsed.success) return null;
    const { summary, followUps } = parsed.data;
    return [summary, ...followUps].every(isMongolian) && !/\d+\s*(оноо|\/\s*100)/.test(summary) ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * «Шүүлэгч» for a finished session: the rubric's verdict/score/missed items,
 * with a model-written summary and follow-up questions when the model answers
 * in time and in shape; otherwise the rubric fallback.
 */
export async function generateDebrief(auth: SessionData, sessionId: string, provider = getPatientProvider()): Promise<Debrief> {
  const view = await getSessionView(auth, sessionId);
  if (!view.evaluation) throw Errors.notFound("Үнэлгээ");
  const base = fallbackDebrief(view.evaluation.result);
  if (view.evaluation.narrative) base.summary = view.evaluation.narrative;
  if (!(provider instanceof ChatModelProvider)) return base;

  const { result } = view.evaluation;
  const facts = {
    transcript: view.messages.slice(-40).map((m) => `${m.role === "student" ? "Суралцагч" : m.role === "patient" ? "Өвчтөн" : "Үзлэг"}: ${m.content.slice(0, 300)}`),
    expectedDiagnosis: result.diagnosis.expected,
    submittedDiagnosis: result.diagnosis.submitted,
    verdict: base.verdict,
    missed: base.missed.map((m) => ({ item: m.label, critical: m.critical })),
  };
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const text = await provider.complete(
        { system: SYSTEM, messages: [{ role: "user", content: JSON.stringify(facts) }], maxTokens: 700, temperature: 0.3 },
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      const reply = parseReply(text);
      if (reply) return { ...base, summary: reply.summary, followUps: reply.followUps, source: "model" };
    } catch {
      // Timeout, rate limit or network: try again, then fall back.
    }
  }
  return base;
}
