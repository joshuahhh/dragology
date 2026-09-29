import { Vec2 } from "../../math/vec2";
import { XYWH, boundingXYWH, inXYWH, mm, overlapsXYWH } from "../../math/xywh";
import { cubicLen, sampleCubic } from "./geometry";
import { HardName, hardKnot } from "./hard";
import {
  Knot,
  edgeCubics,
  flipCrossing,
  isValid,
  knotFromParametric,
  seededRandom,
  strayCrossings,
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

// # Layout

const CANVAS = XYWH(30, 50, 500, 350);

export function inBounds(k: Knot): boolean {
  return edgeCubics(k).every((c) =>
    sampleCubic(c, 8).every((p) => inXYWH(p, CANVAS)),
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
  const boxes = pts.map(boundingXYWH);
  const ends = (i: number) => [k.code[i].n, k.code[(i + 1) % V].n];
  let E = 0;
  for (let i = 0; i < V; i++) {
    for (let j = i; j < V; j++) {
      if (!overlapsXYWH(boxes[i], boxes[j], SPACE)) continue;
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
          if (shared.some((nd) => p.dist(nd) < SPACE && q.dist(nd) < SPACE)) {
            continue;
          }
          E += (SPACE - Math.sqrt(d2)) ** 2;
        }
      }
    }
  }
  for (const c of cubics) E += 0.006 * cubicLen(c, 12) ** 2;

  cubics.forEach((c, i) => {
    const ps = pts[i];
    // smooth flow: penalize bending (squared second differences)
    for (let s = 1; s < N; s++) {
      const bx = ps[s - 1].x - 2 * ps[s].x + ps[s + 1].x;
      const by = ps[s - 1].y - 2 * ps[s].y + ps[s + 1].y;
      E += W_BEND * (bx * bx + by * by);
    }
    const ed = k.edges[k.code[i].e];
    if (k.code[i].n === k.code[(i + 1) % V].n) {
      // loops: keep them big enough to see and grab
      const size = Math.max(...ps.map((p) => p.dist(c[0])));
      if (size < LOOP_MIN) E += 8 * (LOOP_MIN - size) ** 2;
    } else {
      // handles near a third of the chord, so strands flow through
      // crossings instead of turning sharply right after them
      const third = c[3].dist(c[0]) / 3;
      E += W_HANDLE * ((ed.a - third) ** 2 + (ed.b - third) ** 2);
    }
  });

  // keep crossings apart
  const xs = Object.values(k.nodes).filter((nd) => nd.kind === "x");
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const d = Vec2(xs[i]).dist(xs[j]);
      if (d < NODE_SPACE) E += 20 * (NODE_SPACE - d) ** 2;
    }
  }
  return E;
}

const W_BEND = 4;
const W_HANDLE = 0.4;
const LOOP_MIN = 38;
const NODE_SPACE = 34;

/**
 * Hill-climb the spacing energy by random perturbations of nodes and
 * edge handles, keeping the diagram valid and on the canvas.
 */
export function relax(k0: Knot, iterations: number, rand: () => number): Knot {
  let k = k0;
  let E = energy(k);
  let stray = strayCrossings(k);
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
    if (stray > 0) {
      // repairing: accept anything with fewer stray crossings
      const s2 = strayCrossings(next);
      if (s2 > stray || (s2 === stray && energy(next) >= E)) continue;
      k = next;
      stray = s2;
      E = energy(k);
      continue;
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

/** Translate a diagram so its drawing is centered on the canvas. */
export function center(k: Knot): Knot {
  const box = boundingXYWH(edgeCubics(k).flatMap((c) => sampleCubic(c, 8)));
  const d = mm(CANVAS).sub(mm(box));
  const nodes: Knot["nodes"] = {};
  for (const [id, nd] of Object.entries(k.nodes)) {
    nodes[id] = { ...nd, ...d.add(nd).xy() };
  }
  return { ...k, nodes };
}

// The two puzzle presets. They're baked into tangles.json so the demo
// doesn't spend seconds relaxing them on load; knot.test.ts checks the
// file is up to date (run `npx vitest run -u` to rewrite it).
//
// A: the Culprit, a famous hard unknot: no move simplifies it until
// you first add crossings.
// B: the "Monster" hard unknot with one crossing changed, which makes
// it a trefoil.
export const makeTangleA = () => prettyHard("culprit");
export const makeTangleB = () => flipCrossing(prettyHard("monster"), "n8");

/** A classic hard diagram, relaxed into a readable layout. */
export function prettyHard(name: HardName, seed = 1, iterations = 3000): Knot {
  return center(relax(hardKnot(name), iterations, seededRandom(seed)));
}
