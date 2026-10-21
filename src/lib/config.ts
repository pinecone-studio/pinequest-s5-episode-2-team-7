import "server-only";
import { z } from "zod";

/**
 * Server-side configuration, validated once. Nothing here is exposed to the
 * browser (no NEXT_PUBLIC_ variables are used anywhere in the app).
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  PGLITE_DATA_DIR: z.string().default(".data/pglite"),

  PATIENT_PROVIDER: z.enum(["mock", "gemini", "anthropic", "openai_compatible", "finetuned"]).default("mock"),
  PATIENT_FALLBACK_PROVIDER: z.enum(["mock", "none"]).default("mock"),
  INTENT_CLASSIFIER: z.enum(["keyword", "hybrid"]).default("keyword"),
  FEEDBACK_NARRATIVE: z.enum(["off", "llm"]).default("off"),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  OPENAI_COMPAT_BASE_URL: z.string().optional(),
  OPENAI_COMPAT_API_KEY: z.string().optional(),
  OPENAI_COMPAT_MODEL: z.string().optional(),
  FINETUNED_BASE_URL: z.string().optional(),
  FINETUNED_API_KEY: z.string().optional(),
  FINETUNED_MODEL: z.string().default("pinequest-patient"),
  FINETUNED_EXPECTED_ADAPTER: z.string().optional(),

  RATE_LIMIT_MESSAGES_PER_MINUTE: z.coerce.number().int().positive().default(20),

  // Optional voice features (all off when unset).
  CHIMEGE_STT_TOKEN: z.string().optional(),
  CHIMEGE_TTS_TOKEN: z.string().optional(),
  CHIMEGE_VOICE_MALE: z.string().default("MALE1v2"),
  CHIMEGE_VOICE_FEMALE: z.string().default("FEMALE3v2"),
  // Which service voices the patient: Chimege (Mongolian-only) or ElevenLabs (Eleven v4 models speak Mongolian).
  TTS_PROVIDER: z.enum(["chimege", "elevenlabs"]).default("chimege"),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_MODEL: z.string().default("eleven_v4_turbo"),
  ELEVENLABS_VOICE_MALE: z.string().optional(),
  ELEVENLABS_VOICE_FEMALE: z.string().optional(),
  SIMLI_API_KEY: z.string().optional(),
  SIMLI_FACE_ID_MALE: z.string().optional(),
  SIMLI_FACE_ID_FEMALE: z.string().optional(),
});

export type AppConfig = z.infer<typeof EnvSchema> & { sessionSecret: string };

const DEV_ONLY_SECRET = "dev-only-insecure-session-secret-change-me-0123456789";

let cached: AppConfig | null = null;

/** Treat empty strings in .env as "unset". */
function cleanEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) if (value !== undefined && value !== "") out[key] = value;
  return out;
}

export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(cleanEnv(process.env));
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  const env = parsed.data;
  let sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    if (env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set to at least 32 characters in production.");
    }
    if (sessionSecret) console.warn("[config] SESSION_SECRET is shorter than 32 characters; using the dev-only secret.");
    sessionSecret = DEV_ONLY_SECRET;
  }
  cached = { ...env, sessionSecret };
  return cached;
}

/** For tests: forget the cached configuration. */
export function resetConfigForTests() {
  cached = null;
}
