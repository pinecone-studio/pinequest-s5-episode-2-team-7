import "server-only";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { GeminiPatientProvider } from "@/lib/patient/providers/gemini";
import { NEWS_CATEGORIES, type NewsCategory } from "@/lib/services/news";

export interface TranslationInput {
  title: string;
  description: string;
  sourceName: string;
}

export interface Translation {
  title: string;
  summary: string;
  category: NewsCategory | null;
}

export type NewsTranslator = (input: TranslationInput) => Promise<Translation>;

const SYSTEM = `Чи эрүүл мэндийн мэдээг монгол хэлэнд орчуулагч.
Оролт нь англи хэлтэй мэдээний гарчиг ба товч тайлбар (JSON).
Зөвхөн дараах JSON-ийг буцаа, өөр текст бүү нэм:
{"title": "...", "summary": "...", "category": "..."}
- title: гарчгийг утгыг нь хадгалж, байгалийн монгол хэлээр (≤ 150 тэмдэгт).
- summary: оролтод байгаа мэдээлэл дээр тулгуурласан 2–3 өгүүлбэрийн товч, монголоор.
  Оролтод байхгүй баримт, тоо, зөвлөгөө бүү зохио.
- Эмнэлгийн нэр томьёог Монголд хэрэглэгддэг хэлбэрээр бич; шаардлагатай бол хаалтанд англи нэрийг үлдээ.
- category: ${NEWS_CATEGORIES.join(", ")} гэсэн утгуудаас нэг.`;

const clipped = (max: number) =>
  z
    .string()
    .trim()
    .min(3)
    .transform((s) => s.slice(0, max));

const TranslationJson = z.object({
  title: clipped(200),
  summary: clipped(500),
  category: z.string().optional(),
});

/** Parse the model reply, tolerating a ```json fence around it. */
export function parseTranslation(text: string): Translation {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Translator reply has no JSON object");
  const data = TranslationJson.parse(JSON.parse(json));
  const category = (NEWS_CATEGORIES as readonly string[]).includes(data.category ?? "") ? (data.category as NewsCategory) : null;
  return { title: data.title, summary: data.summary, category };
}

/**
 * Gemini translator (uses GEMINI_API_KEY whatever PATIENT_PROVIDER is).
 * Returns null when no key is configured.
 */
export function getNewsTranslator(): NewsTranslator | null {
  const config = getConfig();
  if (!config.GEMINI_API_KEY) return null;
  const gemini = new GeminiPatientProvider(config.GEMINI_API_KEY, config.GEMINI_MODEL);
  return async (input) => {
    const text = await gemini.complete(
      {
        system: SYSTEM,
        messages: [{ role: "user", content: JSON.stringify({ source: input.sourceName, title: input.title, description: input.description.slice(0, 1500) }) }],
        maxTokens: 800,
        temperature: 0.2,
      },
      { signal: AbortSignal.timeout(config.PROVIDER_TIMEOUT_MS) },
    );
    return parseTranslation(text);
  };
}
