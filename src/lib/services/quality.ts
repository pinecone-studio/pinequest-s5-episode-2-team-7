import "server-only";
import { validateCase, type PatientCase } from "@/lib/cases/schema";
import { getTopic } from "@/lib/patient/topics";
import { exportCases } from "./cases";

export type QualitySeverity = "error" | "warning" | "info";

export interface QualityIssue {
  caseId: string;
  severity: QualitySeverity;
  message: string;
}

/** Heuristic data-quality checks for case authors (beyond schema validity). */
export function inspectCase(c: PatientCase): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const add = (severity: QualitySeverity, message: string) => issues.push({ caseId: c.id, severity, message });

  const valid = validateCase(c);
  if (!valid.ok) for (const i of valid.issues) add("error", `${i.path}: ${i.message}`);

  if (c.provenance.clinicalReview.status !== "reviewed") add("warning", "Эмнэлзүйн мэргэжилтэн хянаагүй.");
  if (c.provenance.translation.status !== "human_reviewed" && c.provenance.translation.status !== "original") {
    add("warning", `Орчуулгын төлөв: ${c.provenance.translation.status} — хүн хянах шаардлагатай.`);
  }
  if (!c.provenance.trainingUseAllowed) add("info", "Лиценз сургалтын өгөгдөлд ашиглахыг зөвшөөрөөгүй.");

  const patientFacts = c.hidden.facts.filter((f) => f.patientKnows);
  const missingEn = c.hidden.facts.filter((f) => !f.answer.en).length;
  if (missingEn > 0) add("info", `${missingEn} баримтад англи эх/орчуулга алга.`);
  const noLeak = patientFacts.filter((f) => f.kind === "positive" && f.leakTerms.length === 0).map((f) => f.id);
  if (noLeak.length > 0) add("warning", `Эерэг баримтад leakTerms алга (LLM-ийн нууц задралыг илрүүлэхэд хэрэгтэй): ${noLeak.join(", ")}`);
  if (!patientFacts.some((f) => f.volunteerOnBroad)) add("warning", "Ерөнхий асуултад хэлэх (volunteerOnBroad) баримт алга.");

  const seen = new Map<string, string>();
  for (const f of c.hidden.facts) {
    const key = f.answer.mn.trim();
    if (seen.has(key)) add("warning", `Давхардсан хариулт: ${seen.get(key)} ба ${f.id}`);
    seen.set(key, f.id);
  }

  const covered = new Set(c.hidden.facts.flatMap((f) => f.topics));
  for (const item of c.rubric.items) {
    const answered = item.topics.filter((t) => covered.has(t) || getTopic(t)?.kind === "symptom");
    if (answered.length < item.topics.length) {
      add("info", `Рубрик "${item.id}": зарим сэдэвт баримт алга (${item.topics.filter((t) => !answered.includes(t)).join(", ")}) — өвчтөн "мэдэхгүй" гэж хариулна.`);
    }
  }
  if (c.hidden.diagnosis.acceptedAliases.length < 3) add("warning", "Оношийн синоним цөөн байна (монгол, англи хувилбар нэмнэ үү).");
  return issues;
}

export async function qualityReport() {
  const all = await exportCases();
  const issues = all.flatMap(inspectCase);
  return {
    cases: all.length,
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    issues,
  };
}
