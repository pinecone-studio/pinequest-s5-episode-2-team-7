import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
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

function userMessage(input: TranslationInput): string {
  return JSON.stringify({ source: input.sourceName, title: input.title, description: input.description.slice(0, 1500) });
}

/**
 * News translator: Gemini (GEMINI_API_KEY, free tier) first, Claude
 * (ANTHROPIC_API_KEY, the small classifier model) when Gemini is missing or
 * fails (quota, network). Returns null when neither key is configured.
 */
export function getNewsTranslator(): NewsTranslator | null {
  const config = getConfig();
  if (!config.GEMINI_API_KEY && !config.ANTHROPIC_API_KEY) return null;
  const gemini = config.GEMINI_API_KEY ? new GeminiPatientProvider(config.GEMINI_API_KEY, config.GEMINI_MODEL) : null;
  // Explicit base URL: never inherit ANTHROPIC_BASE_URL from the host environment.
  const claude = config.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, maxRetries: 1, baseURL: "https://api.anthropic.com" }) : null;

  const viaGemini = async (input: TranslationInput) =>
    parseTranslation(
      await gemini!.complete(
        { system: SYSTEM, messages: [{ role: "user", content: userMessage(input) }], maxTokens: 800, temperature: 0.2 },
        { signal: AbortSignal.timeout(config.PROVIDER_TIMEOUT_MS) },
      ),
    );

  // Structured output: the reply is always the JSON object, no parsing guesswork.
  const ClaudeJson = z.object({ title: z.string(), summary: z.string(), category: z.enum(NEWS_CATEGORIES) });
  const viaClaude = async (input: TranslationInput) => {
    const reply = await claude!.beta.messages.parse(
      {
        model: config.ANTHROPIC_CLASSIFIER_MODEL,
        max_tokens: 1000,
        system: SYSTEM,
        messages: [{ role: "user", content: userMessage(input) }],
        output_config: { format: betaZodOutputFormat(ClaudeJson) },
      },
      { signal: AbortSignal.timeout(config.PROVIDER_TIMEOUT_MS) },
    );
    if (!reply.parsed_output) throw new Error("Translator reply has no JSON object");
    return parseTranslation(JSON.stringify(reply.parsed_output));
  };

  // After one Gemini failure in a run, go straight to Claude (no 20 s timeout per item).
  let geminiDown = false;
  return async (input) => {
    if (gemini && !geminiDown) {
      try {
        return await viaGemini(input);
      } catch (error) {
        if (!claude) throw error;
        geminiDown = true;
        console.warn(`[news] Gemini failed, using Claude: ${error instanceof Error ? error.message : error}`);
      }
    }
    return viaClaude(input);
  };
}
