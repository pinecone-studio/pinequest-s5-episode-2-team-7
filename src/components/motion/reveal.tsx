"use client";

import { motion, type HTMLMotionProps } from "motion/react";

/** Fades/slides children in once when scrolled into view. */
export function Reveal({ delay = 0, y = 24, ...props }: HTMLMotionProps<"div"> & { delay?: number; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    />
  );
}

/** `Reveal` for list items. */
export function RevealLi({ delay = 0, y = 24, ...props }: HTMLMotionProps<"li"> & { delay?: number; y?: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    />
  );
}

/**
 * Soft gradient blobs drifting behind a section (CSS transform animation).
 * `fixed` pins them to the viewport, for pages narrower than the screen.
 */
export function Blobs({ fixed = false }: { fixed?: boolean }) {
  return (
    <div aria-hidden className={`pointer-events-none inset-0 -z-10 overflow-hidden ${fixed ? "fixed" : "absolute"}`}>
      <div className="absolute -left-24 -top-24 h-[28rem] w-[28rem] animate-blob rounded-full blur-3xl" style={{ background: "var(--blob-a)" }} />
      <div
        className="absolute -right-32 top-10 h-[32rem] w-[32rem] animate-blob rounded-full blur-3xl"
        style={{ background: "var(--blob-b)", animationDelay: "-6s", animationDuration: "22s" }}
      />
      <div
        className="absolute bottom-[-12rem] left-1/3 h-[26rem] w-[26rem] animate-blob rounded-full blur-3xl"
        style={{ background: "var(--blob-c)", animationDelay: "-12s", animationDuration: "26s" }}
      />
    </div>
  );
}
