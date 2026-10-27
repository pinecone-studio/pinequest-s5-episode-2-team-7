import "server-only";
import { loadDemoCases } from "@/lib/cases/demo";
import type { PatientCase } from "@/lib/cases/schema";
import { classifyQuestion } from "@/lib/patient/classifier";
import type { TranscriptTurn } from "@/lib/patient/context";
import { planTurn } from "@/lib/patient/engine";
import { getPatientProvider } from "@/lib/patient/providers";
import { simulateTurn } from "@/lib/patient/simulator";
import type { CoachLine, CoachPack, TurnEvent } from "./types";

/**
 * «Манай AI өвчтөн»: the demo cases played by our own fine-tuned model
 * (ml/ → inference/ on Modal) inside the AI дасгалжуулагч. Each case becomes a
 * coach pack; its replies go through the original patient pipeline
 * (classifier → disclosure plan → the prompt format the adapter was trained
 * on → validation), so the model sees exactly what it learned. When the model
 * is asleep, down or fails validation, the caller falls back to Claude playing
 * the same pack, and the page is told which one answered.
 */

export const CASE_PACK_PREFIX = "case-";

export const isCasePack = (id: string) => id.startsWith(CASE_PACK_PREFIX);

function casePack(c: PatientCase): CoachPack {
  const p = c.public.patient;
  const mn = (t: { mn: string } | undefined) => t?.mn ?? "";
  return {
    id: `${CASE_PACK_PREFIX}${c.id}`,
    kind: "model-patient",
    title: `${p.name}, ${p.age}`,
    subtitle: mn(c.public.displayTitle),
    icon: p.sex === "male" ? "👨" : "👩",
    traineeRole: "эмч",
    defaultMode: "audio",
    language: "mn",
    gender: p.sex === "male" ? "male" : "female",
    maxSec: 600,
    // Synthetic cases, not yet reviewed by a clinician.
    draft: true,
    brief: `${mn(c.public.setting)}. ${mn(c.public.displayTitle)}. Анамнез авч, юу болсныг олж, дараагийн алхмаа тайлбарлана уу.`,
    persona: { name: p.name, age: p.age, description: [mn(p.occupation), mn(c.persona.personality)].filter(Boolean).join(". ") },
    situation: `Үндсэн зовиур: ${mn(c.public.chiefComplaint)}. ${mn(c.persona.emotionalState)}`,
    goal: "Юу болоод байгааг ойлгож, тусламж авах.",
    // Claude (the fallback) only ever sees what the patient knows; the diagnosis stays in the grading notes.
    hidden: c.hidden.facts.filter((f) => f.patientKnows).map((f) => f.answer.mn),
    rules: [
      "Зөвхөн асуусан зүйлд хариулна; асуугаагүй баримтыг өөрөө дэлгэрүүлэхгүй.",
      "Оношоо мэдэхгүй; эмнэлгийн нэр томьёо хэрэглэхгүй.",
      mn(c.persona.speakingStyle),
    ].filter(Boolean),
    opening: mn(c.public.openingLine),
    openingEmotion: "worried",
    fillers: ["Ммм...", "За..."],
    rubric: c.rubric.items.map((item) => ({ id: item.id, label: item.label.mn })),
    gradingNotes: `Зөв онош: ${mn(c.hidden.diagnosis.label)}. ${mn(c.education.explanation)}`,
  };
}

let packs: { pack: CoachPack; patientCase: PatientCase }[] | null = null;

function all() {
  return (packs ??= loadDemoCases().map((c) => ({ pack: casePack(c), patientCase: c })));
}

export const modelPatientPacks = () => all().map((p) => p.pack);
export const modelPatientPack = (id: string) => all().find((p) => p.pack.id === id)?.pack;

// --- Is our model up? -------------------------------------------------------------

const HEALTH_TTL_MS = 60_000;
const HEALTH_TIMEOUT_MS = 4_000;
let status: { ok: boolean; detail: string; at: number } | null = null;

/**
 * Cached for a minute and answered within a few seconds, so a sleeping GPU never
 * stalls a conversation; while it is down, each check also asks it to wake up.
 */
export async function modelStatus(): Promise<{ ok: boolean; detail: string; label: string }> {
  const provider = getPatientProvider();
  if (provider.id !== "finetuned") return { ok: false, detail: `PATIENT_PROVIDER=${provider.id}`, label: provider.label };
  if (!status || Date.now() - status.at > HEALTH_TTL_MS) {
    const real = provider.health();
    // A slow answer still lands in the cache, so the status shows the real reason next time.
    void real.then((h) => (status = { ok: h.ok, detail: h.detail, at: Date.now() })).catch(() => undefined);
    const health = await Promise.race([
      real,
      new Promise<{ ok: false; detail: string }>((resolve) => setTimeout(() => resolve({ ok: false, detail: "Загвар сэрж байна (cold start)" }), HEALTH_TIMEOUT_MS)),
    ]).catch((error: unknown) => ({ ok: false, detail: error instanceof Error ? error.message : "health check failed" }));
    status = { ok: health.ok, detail: health.detail, at: Date.now() };
    if (!health.ok) void provider.warmUp?.().catch(() => undefined);
  }
  return { ok: status.ok, detail: status.detail, label: provider.label };
}

export function resetModelStatusForTests() {
  status = null;
}

// --- One reply ----------------------------------------------------------------------

/**
 * Replays the earlier questions through the deterministic planner to know which
 * facts were already shared, then lets our model answer the last one, streaming
 * sentences as they pass validation. Returns false when the model could not
 * answer and nothing was said, so the caller can hand the turn to Claude.
 */
export async function modelPatientTurn(packId: string, history: CoachLine[], emit: (event: TurnEvent) => void): Promise<boolean> {
  const entry = all().find((p) => p.pack.id === packId);
  if (!entry || !(await modelStatus()).ok) return false;
  const { patientCase } = entry;

  const asked = history.filter((h) => h.role === "me" && h.text.trim() && h.text !== "(чимээгүй)");
  const question = asked.at(-1)?.text;
  if (!question) return false;

  const disclosed = new Set<string>();
  asked.slice(0, -1).forEach((h, turnIndex) => {
    planTurn(patientCase, classifyQuestion(h.text), { disclosedFactIds: disclosed, turnIndex }).newlyDisclosedIds.forEach((id) => disclosed.add(id));
  });
  // The opening line is not part of the model's transcript (as in the original simulator).
  const transcript: TranscriptTurn[] = history
    .slice(history[0]?.role === "ai" ? 1 : 0, -1)
    .map((h) => ({ role: h.role === "me" ? "student" : "patient", text: h.text }));

  let spoke = false;
  try {
    const result = await simulateTurn(
      { patientCase, question, disclosedFactIds: disclosed, history: transcript, turnIndex: asked.length - 1 },
      {
        provider: getPatientProvider(),
        fallback: "none",
        intentMode: "keyword",
        timeoutMs: 25_000,
        onSentence: (sentence) => {
          if (!spoke) emit({ t: "src", v: "model" });
          spoke = true;
          emit({ t: "say", text: sentence });
        },
      },
    );
    if (!spoke) {
      emit({ t: "src", v: "model" });
      emit({ t: "say", text: result.patientText });
    }
    emit({ t: "done", text: result.patientText });
    return true;
  } catch (error) {
    console.warn(`[model-patient] ${packId}: ${error instanceof Error ? error.message : error}`);
    // Sentences already heard stay; otherwise Claude takes this turn.
    return spoke;
  }
}
