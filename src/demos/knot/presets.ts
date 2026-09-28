import {
  Knot,
  analyze,
  bakeBrush,
  diagramKey,
  knotFromParametric,
  movesAt,
  resampleKnot,
} from "./knot";

export const CX = 280;
export const CY = 230;

export const trefoil = (): Knot =>
  knotFromParametric(
    (t) => ({
      x: CX + 36 * (Math.sin(t) + 2 * Math.sin(2 * t)),
      y: CY + 36 * (Math.cos(t) - 2 * Math.cos(2 * t)),
      z: -Math.sin(3 * t),
    }),
    60,
  );

export const figureEight = (): Knot =>
  knotFromParametric(
    (t) => ({
      x: CX + 46 * (2 + Math.cos(2 * t)) * Math.cos(3 * t),
      y: CY + 46 * (2 + Math.cos(2 * t)) * Math.sin(3 * t),
      z: Math.sin(4 * t),
    }),
    90,
  );

export const unknot = (): Knot =>
  knotFromParametric(
    (t) => ({ x: CX + 80 * Math.cos(t), y: CY + 80 * Math.sin(t), z: 0 }),
    30,
  );

// # Scrambled starting positions

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const CANVAS = { x0: 40, y0: 60, x1: 520, y1: 390 };

function inBounds(k: Knot): boolean {
  return k.pts.every(
    (p) =>
      p.x > CANVAS.x0 && p.x < CANVAS.x1 && p.y > CANVAS.y0 && p.y < CANVAS.y1,
  );
}

/**
 * Mess up a knot by applying random R1 twists and R2 pushes (both over
 * and under), so the result needs simplifying to reveal what it is.
 */
export function scramble(
  knot: Knot,
  seed: number,
  steps: number,
  stats?: { r1: number; r2: number; nudges: number },
  onStep?: (kind: string, before: Knot, after: Knot, raw: Knot) => void,
): Knot {
  const rand = lcg(seed);
  let k = knot;
  let tries = 0;
  let done = 0;
  while (done < steps && tries < 600) {
    tries++;
    const p = k.pts[Math.floor(rand() * k.pts.length)];
    if (rand() < 0.5) {
      // cosmetic nudge: pull a stretch of strand somewhere else
      const a = rand() * 2 * Math.PI;
      const r = 25 + rand() * 35;
      const nudged = bakeBrush({
        ...k,
        brush: { at: p.id, dx: r * Math.cos(a), dy: r * Math.sin(a) },
      });
      const next = resampleKnot(nudged);
      if (!inBounds(next)) continue;
      if (diagramKey(analyze(next)) !== diagramKey(analyze(k))) continue;
      onStep?.("nudge", k, next, nudged);
      k = next;
      if (stats) stats.nudges++;
      continue;
    }
    const under = rand() < 0.5;
    const moves = movesAt(k, p.id, under).filter(
      (m) => m.kind === "R1" || m.kind === "R2",
    );
    if (moves.length === 0) continue;
    // prefer pushes once there's something to push across
    const pushes = moves.filter((m) => m.kind === "R2");
    const pool = pushes.length > 0 && rand() < 0.8 ? pushes : moves;
    const m = pool[Math.floor(rand() * pool.length)];
    const next = resampleKnot(m.to);
    if (!inBounds(next)) continue;
    onStep?.(m.kind, k, next, m.to);
    k = next;
    done++;
    if (stats) {
      if (m.kind === "R1") stats.r1++;
      else stats.r2++;
    }
  }
  return smooth(k, 12);
}

/**
 * Relax the curve (each point moves toward its neighbors' midpoint),
 * as long as the diagram stays the same. Rounds off the corners that
 * nudging leaves behind.
 */
export function smooth(knot: Knot, iterations: number): Knot {
  let k = knot;
  let key = diagramKey(analyze(k));
  for (let it = 0; it < iterations; it++) {
    const N = k.pts.length;
    const pts = k.pts.map((p, j) => {
      const a = k.pts[(j - 1 + N) % N];
      const b = k.pts[(j + 1) % N];
      return {
        ...p,
        x: p.x + 0.25 * ((a.x + b.x) / 2 - p.x),
        y: p.y + 0.25 * ((a.y + b.y) / 2 - p.y),
      };
    });
    const next = resampleKnot({ ...k, pts });
    if (diagramKey(analyze(next)) !== key) break;
    k = next;
    key = diagramKey(analyze(k));
  }
  return k;
}
