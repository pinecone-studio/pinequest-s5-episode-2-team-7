/**
 * The diagnosis confidence slider is browser-only: the API has no field for
 * it, so it is kept in sessionStorage and shown back on the results screen.
 */
export interface Confidence {
  value: number;
  label: string;
}

const key = (id: string) => `pq-confidence:${id}`;

export function saveConfidence(id: string, confidence: Confidence) {
  try {
    sessionStorage.setItem(key(id), JSON.stringify(confidence));
  } catch {
    // Not critical.
  }
}

export function loadConfidence(id: string): Confidence | null {
  try {
    const raw = sessionStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as Confidence) : null;
  } catch {
    return null;
  }
}
