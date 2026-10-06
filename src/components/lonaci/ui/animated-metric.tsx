"use client";

import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function useAnimatedNumber(target: number, durationMs = 1100): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - start) / durationMs);
      const next = from + (target - from) * easeOutExpo(t);
      fromRef.current = next;
      setValue(next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, durationMs]);

  return value;
}

export function AnimatedMetric({
  value,
  className,
  decimals = 0,
  suffix = "",
  prefix = "",
}: {
  value: number;
  className?: string;
  decimals?: number;
  suffix?: string;
  prefix?: string;
}) {
  const animated = useAnimatedNumber(value);
  const formatted = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(decimals > 0 ? animated : Math.round(animated));

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
