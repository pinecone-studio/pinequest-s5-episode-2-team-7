/** Gyroscope access for the 360° scene. */
export type MotionAccess = "granted" | "denied" | "unsupported";

type OrientationWithPermission = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * iOS asks for motion permission, and only from inside a tap handler — call
 * this first, before any other await. Android and desktop need no prompt.
 */
export async function requestMotionAccess(): Promise<MotionAccess> {
  // Desktop Chrome also exposes requestPermission (and grants it) without a gyroscope: phones/tablets only.
  if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined" || !("ontouchstart" in window)) return "unsupported";
  const request = (DeviceOrientationEvent as OrientationWithPermission).requestPermission;
  if (typeof request !== "function") return "granted";
  try {
    return (await request()) === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}
