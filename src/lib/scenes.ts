/**
 * Where the video call "takes place": a background drawn behind the cut-out
 * patient avatar plus a quiet ambient soundscape. Purely presentational —
 * the case content does not change.
 */
export const SCENE_IDS = ["original", "accident", "ambulance", "er", "home", "steppe"] as const;
export type SceneId = (typeof SCENE_IDS)[number];

export const SCENES: Record<SceneId, { label: string; emoji: string }> = {
  original: { label: "Анхны дэвсгэр", emoji: "🎥" },
  accident: { label: "Ослын газар", emoji: "🚧" },
  ambulance: { label: "Түргэний машин", emoji: "🚑" },
  er: { label: "Яаралтай тасаг", emoji: "🏥" },
  home: { label: "Гэр (дуудлага)", emoji: "🏠" },
  steppe: { label: "Хөдөө, хээр", emoji: "⛺" },
};

/** Default scene per case (a case not listed keeps the avatar's own background). */
const CASE_SCENES: Record<string, SceneId> = {
  "chest-pain-01": "ambulance",
  "palpitations-01": "er",
  "dyspnea-swelling-01": "er",
  "headache-dizziness-01": "home",
  "fever-joint-pain-01": "steppe",
};

export function defaultScene(caseId: string): SceneId {
  return CASE_SCENES[caseId] ?? "original";
}

export function isSceneId(value: unknown): value is SceneId {
  return typeof value === "string" && (SCENE_IDS as readonly string[]).includes(value);
}
