import type { CSSProperties } from "react";
import { cn } from "./ui";

/** The iridescent orb that stands for the AI (same as `Orb` in the iOS app). Decorative. */
export function Orb({ size = 200, still = false, className }: { size?: number; still?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("orb inline-block shrink-0", still && "before:animate-none", className)}
      style={{ width: size, height: size, "--orb-size": `${size}px` } as CSSProperties}
    />
  );
}
