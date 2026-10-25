/** Gyroscope access for the 360° scene. */
export type MotionAccess = "granted" | "denied" | "unsupported";

type OrientationWithPermission = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * iOS asks for motion permission, and only from inside a tap handler — call
 * this first, before any other await. Android and desktop need no prompt.
 */
export async function requestMotionAccess(): Promise<MotionAccess> {
  if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") return "unsupported";
  const request = (DeviceOrientationEvent as OrientationWithPermission).requestPermission;
  if (typeof request !== "function") return "ontouchstart" in window ? "granted" : "unsupported";
  try {
    return (await request()) === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}
