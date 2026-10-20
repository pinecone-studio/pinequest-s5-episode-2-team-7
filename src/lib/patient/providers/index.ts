import "server-only";
import { getConfig, type AppConfig } from "@/lib/config";
import { AnthropicPatientProvider } from "./anthropic";
import { FineTunedPatientProvider } from "./finetuned";
import { GeminiPatientProvider } from "./gemini";
import { MockPatientProvider } from "./mock";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { ProviderError, type PatientProvider } from "./types";

/**
 * Build the configured patient provider. Switching providers is purely a
 * configuration change (PATIENT_PROVIDER); the chat UI and session logic
 * are unaffected.
 */
export function createPatientProvider(config: AppConfig = getConfig()): PatientProvider {
  switch (config.PATIENT_PROVIDER) {
    case "mock":
      return new MockPatientProvider();
    case "gemini":
      return new GeminiPatientProvider(config.GEMINI_API_KEY ?? "", config.GEMINI_MODEL);
    case "anthropic":
      return new AnthropicPatientProvider(config.ANTHROPIC_API_KEY ?? "", config.ANTHROPIC_MODEL);
    case "openai_compatible":
      return new OpenAICompatibleProvider(config.OPENAI_COMPAT_BASE_URL ?? "", config.OPENAI_COMPAT_MODEL ?? "", config.OPENAI_COMPAT_API_KEY);
    case "finetuned":
      return new FineTunedPatientProvider(config.FINETUNED_BASE_URL ?? "", config.FINETUNED_MODEL, config.FINETUNED_API_KEY, config.FINETUNED_EXPECTED_ADAPTER);
  }
}

let cached: PatientProvider | null = null;

/**
 * A misconfigured provider (e.g. missing API key) falls back to the mock
 * provider when PATIENT_FALLBACK_PROVIDER=mock. Sessions then record and
 * display "mock", so the UI never claims a model that is not answering.
 */
export function getPatientProvider(): PatientProvider {
  if (cached) return cached;
  const config = getConfig();
  try {
    cached = createPatientProvider(config);
  } catch (error) {
    if (!(error instanceof ProviderError) || config.PATIENT_FALLBACK_PROVIDER !== "mock") throw error;
    console.warn(`[provider] ${error.message} Falling back to the mock provider.`);
    cached = new MockPatientProvider();
  }
  return cached;
}

export function setPatientProviderForTests(provider: PatientProvider | null) {
  cached = provider;
}
