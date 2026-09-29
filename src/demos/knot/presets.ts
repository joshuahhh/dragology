import { cubicLen, sampleCubic } from "./geometry";
import {
  Knot,
  cleanup,
  edgeCubics,
  isValid,
  knotFromParametric,
  movesAt,
} from "./knot";

export const CX = 280;
export const CY = 230;

export const trefoil = (): Knot =>
  knotFromParametric((t) => ({
    x: CX + 38 * (Math.sin(t) + 2 * Math.sin(2 * t)),
    y: CY + 38 * (Math.cos(t) - 2 * Math.cos(2 * t)),
    z: -Math.sin(3 * t),
  }));

export const figureEight = (): Knot =>
  knotFromParametric((t) => ({
    x: CX + 46 * (2 + Math.cos(2 * t)) * Math.cos(3 * t),
    y: CY + 46 * (2 + Math.cos(2 * t)) * Math.sin(3 * t),
    z: Math.sin(4 * t),
  }));

export const unknot = (): Knot =>
  knotFromParametric((t) => ({
    x: CX + 80 * Math.cos(t),
    y: CY + 80 * Math.sin(t),
    z: 0,
  }));

// # Scrambled starting positions

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const CANVAS = { x0: 30, y0: 50, x1: 530, y1: 400 };

export function inBounds(k: Knot): boolean {
  return edgeCubics(k).every((c) =>
    sampleCubic(c, 8).every(
      (p) =>
        p.x > CANVAS.x0 &&
        p.x < CANVAS.x1 &&
        p.y > CANVAS.y0 &&
        p.y < CANVAS.y1,
    ),
  );
}

/**
 * Spacing energy: strands repel each other within `SPACE` px (except
 * near the nodes they share), and long edges cost a little.
 */
const SPACE = 38;
export function energy(k: Knot): number {
  const cubics = edgeCubics(k);
  const V = k.code.length;
  const N = 10;
  const pts = cubics.map((c) => sampleCubic(c, N));
  const boxes = pts.map((ps) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of ps) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    return { x0, y0, x1, y1 };
  });
  const ends = (i: number) => [k.code[i].n, k.code[(i + 1) % V].n];
  let E = 0;
  for (let i = 0; i < V; i++) {
    const bi = boxes[i];
    for (let j = i; j < V; j++) {
      const bj = boxes[j];
      if (
        bi.x1 + SPACE < bj.x0 ||
        bj.x1 + SPACE < bi.x0 ||
        bi.y1 + SPACE < bj.y0 ||
        bj.y1 + SPACE < bi.y0
      ) {
        continue;
      }
      // nodes the two edges share: pairs of points near one don't count
      const shared = ends(i)
        .filter((n) => ends(j).includes(n))
        .map((n) => k.nodes[n]);
      for (let s = 0; s <= N; s++) {
        const p = pts[i][s];
        for (let t = i === j ? s + 3 : 0; t <= N; t++) {
          const q = pts[j][t];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= SPACE * SPACE) continue;
          if (
            shared.some(
              (nd) =>
                Math.hypot(p.x - nd.x, p.y - nd.y) < SPACE &&
                Math.hypot(q.x - nd.x, q.y - nd.y) < SPACE,
            )
          ) {
            continue;
          }
          E += (SPACE - Math.sqrt(d2)) ** 2;
        }
      }
    }
  }
  for (const c of cubics) E += 0.006 * cubicLen(c, 12) ** 2;
  return E;
}

/**
 * Hill-climb the spacing energy by random perturbations of nodes and
 * edge handles, keeping the diagram valid and on the canvas.
 */
export function relax(k0: Knot, iterations: number, rand: () => number): Knot {
  let k = k0;
  let E = energy(k);
  for (let it = 0; it < iterations; it++) {
    const scale = 1 - (0.7 * it) / iterations;
    let next: Knot;
    if (rand() < 0.6) {
      const ids = Object.keys(k.nodes);
      const id = ids[Math.floor(rand() * ids.length)];
      const nd = k.nodes[id];
      next = {
        ...k,
        nodes: {
          ...k.nodes,
          [id]: {
            ...nd,
            x: nd.x + (rand() - 0.5) * 24 * scale,
            y: nd.y + (rand() - 0.5) * 24 * scale,
            rot: nd.rot + (rand() - 0.5) * 0.5 * scale,
          },
        },
      };
    } else {
      const e = k.code[Math.floor(rand() * k.code.length)].e;
      const ed = k.edges[e];
      next = {
        ...k,
        edges: {
          ...k.edges,
          [e]: {
            a: Math.max(4, ed.a * (1 + (rand() - 0.5) * 0.5 * scale)),
            b: Math.max(4, ed.b * (1 + (rand() - 0.5) * 0.5 * scale)),
          },
        },
      };
    }
    // energy first: it's cheaper than validity, and most proposals
    // are rejected on energy alone
    const E2 = energy(next);
    if (E2 >= E || !inBounds(next) || !isValid(next)) continue;
    k = next;
    E = E2;
  }
  return k;
}

/**
 * Mess up a knot by applying random R1 twists and R2 pushes (both over
 * and under), relaxing the layout as it grows, so the result needs
 * simplifying to reveal what it is.
 */
export function scramble(
  knot: Knot,
  seed: number,
  steps: number,
  onStep?: (kind: string, before: Knot, after: Knot) => void,
): Knot {
  const rand = lcg(seed);
  let k = knot;
  let tries = 0;
  let done = 0;
  while (done < steps && tries < 400) {
    tries++;
    const edges = k.code.map((v) => v.e);
    const e = edges[Math.floor(rand() * edges.length)];
    const under = rand() < 0.5;
    const moves = movesAt(k, e, under).filter(
      (m) => m.kind === "R1" || m.kind === "R2",
    );
    if (moves.length === 0) continue;
    // prefer pushes once there's something to push across
    const pushes = moves.filter((m) => m.kind === "R2");
    const pool = pushes.length > 0 && rand() < 0.8 ? pushes : moves;
    const m = pool[Math.floor(rand() * pool.length)];
    const next = cleanup(m.to);
    if (!inBounds(next)) continue;
    onStep?.(m.kind, k, next);
    k = relax(next, 60, rand);
    done++;
  }
  return center(relax(k, 1500, rand));
}

/** Translate a diagram so its drawing is centered on the canvas. */
export function center(k: Knot): Knot {
  const pts = edgeCubics(k).flatMap((c) => sampleCubic(c, 8));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const dx =
    (CANVAS.x0 + CANVAS.x1) / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
  const dy =
    (CANVAS.y0 + CANVAS.y1) / 2 - (Math.min(...ys) + Math.max(...ys)) / 2;
  const nodes: Knot["nodes"] = {};
  for (const [id, nd] of Object.entries(k.nodes)) {
    nodes[id] = { ...nd, x: nd.x + dx, y: nd.y + dy };
  }
  return { ...k, nodes };
}

// Seeds for the two puzzle presets. They're baked into tangles.json so
// the demo doesn't spend a second relaxing them on load; knot.test.ts
// checks the file is up to date (run with UPDATE_TANGLES=1 to rewrite).
export const TANGLE_SEEDS = { A: 3, B: 2 };
export const makeTangleA = () => scramble(unknot(), TANGLE_SEEDS.A, 8);
export const makeTangleB = () => scramble(trefoil(), TANGLE_SEEDS.B, 5);
