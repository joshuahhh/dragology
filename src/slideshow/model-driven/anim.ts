// Little helpers for describing an animation as a pure function of time.

export function clamp01(u: number) {
  return Math.min(1, Math.max(0, u));
}

export function lerp(a: number, b: number, u: number) {
  return a + (b - a) * u;
}

/** How far t is through the span [a, b], from 0 to 1. */
export function progress(t: number, [a, b]: readonly [number, number]) {
  return b === a ? (t < a ? 0 : 1) : clamp01((t - a) / (b - a));
}

/** A CSS-style cubic-bezier easing curve. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const bez = (a: number, b: number, s: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  return (u: number) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    // Solve x(s) = u by bisection; it's monotonic for 0 ≤ x1, x2 ≤ 1
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (bez(x1, x2, mid) < u) lo = mid;
      else hi = mid;
    }
    return bez(y1, y2, (lo + hi) / 2);
  };
}

export type Easing = (u: number) => number;

export const linear: Easing = (u) => u;
export const easeInOut = cubicBezier(0.42, 0, 0.58, 1);
export const easeOut = cubicBezier(0.3, 0.6, 0.5, 1);

/** `progress`, eased. */
export function eased(
  t: number,
  span: readonly [number, number],
  easing: Easing = easeInOut,
) {
  return easing(progress(t, span));
}

/**
 * Opacity for something that blinks `count` times starting at `start`:
 * 1, fading smoothly to 0 and back each `period` seconds; 1 outside.
 */
export function blink(t: number, start: number, period: number, count: number) {
  if (t <= start || t >= start + period * count) return 1;
  return (1 + Math.cos((2 * Math.PI * (t - start)) / period)) / 2;
}
