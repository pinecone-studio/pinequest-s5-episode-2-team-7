"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";

/** Counts from 0 to `value` once mounted (instant with reduced motion). */
export function CountUp({ value, digits = 0, duration = 1.4, delay = 0 }: { value: number; digits?: number; duration?: number; delay?: number }) {
  const reduce = useReducedMotion();
  const count = useMotionValue(0);
  const text = useTransform(count, (v) => v.toFixed(digits));
  useEffect(() => {
    if (reduce) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, { duration, delay, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [count, value, duration, delay, reduce]);
  return <motion.span>{text}</motion.span>;
}
