import "server-only";
import { getConfig, type AppConfig } from "@/lib/config";
import { MockPatientProvider } from "./mock";
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
    default:
      throw new ProviderError(`Provider "${config.PATIENT_PROVIDER}" is not available in this build.`, config.PATIENT_PROVIDER, "config");
  }
}

let cached: PatientProvider | null = null;

export function getPatientProvider(): PatientProvider {
  cached ??= createPatientProvider();
  return cached;
}

export function setPatientProviderForTests(provider: PatientProvider | null) {
  cached = provider;
}
