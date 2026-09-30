import { Vec2 } from "../../math/vec2";
import { boundingXYWH, overlapsXYWH } from "../../math/xywh";
// Knot diagram model for the knot demo.
//
// A diagram is a cyclic sequence of *visits* (the Gauss code). Each
// visit is a pass through a node and names the edge leaving it. Nodes
// are either crossings (visited twice, once over and once under) or
// invisible "pass" nodes (visited once). Every edge is a single cubic
// from one visit to the next, leaving and arriving along the strand
// directions at its end nodes; its two handle lengths are its only
// free parameters. So the isotopy degrees of freedom are finite:
// position + rotation per node, two handle lengths per edge.
//
// Crossings are always drawn with the strands at right angles. Pass
// nodes show up only transiently: moves that create crossings start
// from a "pre-split" state with pass nodes sitting exactly on the old
// curve, and moves that remove crossings turn them into pass nodes.
// `cleanup` merges pass nodes away again after a drop.

import {
  Cubic,
  bez,
  bezTan,
  closestOnCubic,
  cubicFrom,
  cubicLen,
  cyc,
  fitHandles,
  paramAtLen,
  polylineSelfCrossings,
  safeNorm,
  sampleCubic,
  segHit,
  split,
  subCubic,
} from "./geometry";

export type NodeKind = "x" | "p";
export type KNode = {
  kind: NodeKind;
  x: number;
  y: number;
  /** Direction of the over-strand (crossings) or the strand (pass). */
  rot: number;
  /** Crossing sign; the under-strand runs at rot − sign·90°. */
  sign: 1 | -1;
  /**
   * Pass nodes created by splitting an edge remember that edge's
   * handles, so merging them back restores it exactly.
   */
  hint?: { a: number; b: number; e: string };
  /**
   * A pass node where a crossing is about to appear (at the start of a
   * move) or just went away (at its end), on that crossing's
   * over-strand. It draws a collapsed stand-in for the crossing's
   * bridge, so interpolation moves the gap into place instead of
   * fading it in or out.
   */
  ghostOf?: string;
};
export type Visit = { n: string; over: boolean; e: string };
export type EdgeData = { a: number; b: number };
export type Knot = {
  nodes: Record<string, KNode>;
  code: Visit[];
  edges: Record<string, EdgeData>;
  nextId: number;
};

const MIN_HANDLE = 3;

// # Geometry of a diagram

export function nodePos(k: Knot, i: number): Vec2 {
  const nd = k.nodes[k.code[i].n];
  return Vec2(nd);
}

/** Direction of the strand at visit i. */
export function dirAt(k: Knot, i: number): Vec2 {
  const v = k.code[i];
  const nd = k.nodes[v.n];
  if (nd.kind === "p" || v.over) return Vec2.polarRad(1, nd.rot);
  return Vec2.polarRad(1, nd.rot - (nd.sign * Math.PI) / 2);
}

const cubicsCache = new WeakMap<Knot, Cubic[]>();

/** Cubic of the edge leaving visit i, for every i. */
export function edgeCubics(k: Knot): Cubic[] {
  const cached = cubicsCache.get(k);
  if (cached) return cached;
  const V = k.code.length;
  const out = k.code.map((v, i) => {
    const j = (i + 1) % V;
    const ed = k.edges[v.e];
    return cubicFrom(
      nodePos(k, i),
      dirAt(k, i),
      nodePos(k, j),
      dirAt(k, j),
      ed.a,
      ed.b,
    );
  });
  cubicsCache.set(k, out);
  return out;
}

export function edgeIndex(k: Knot, e: string): number {
  return k.code.findIndex((v) => v.e === e);
}

const SAMPLES = 16;
const validCache = new WeakMap<Knot, boolean>();

/**
 * A diagram is valid when its edges meet only at their shared nodes:
 * no stray intersections, so the drawing is exactly the code.
 */
export function isValid(k: Knot): boolean {
  const cached = validCache.get(k);
  if (cached !== undefined) return cached;
  const result = isValidUncached(k);
  validCache.set(k, result);
  return result;
}

function isValidUncached(k: Knot): boolean {
  return strayCrossings(k, 1) === 0;
}

/**
 * Number of places where edges cross other than at their shared nodes
 * (stopping early once `limit` are found).
 */
export function strayCrossings(k: Knot, limit = Infinity): number {
  const V = k.code.length;
  if (V === 0) return Infinity;
  // each edge as a polyline; segment i of edge e runs pts[e][i] → pts[e][i+1]
  const pts = edgeCubics(k).map((c) => sampleCubic(c, SAMPLES));
  const segBoxes = pts.map((ps) =>
    ps.slice(0, -1).map((p, i) => boundingXYWH([p, ps[i + 1]])),
  );
  const edgeBoxes = pts.map(boundingXYWH);
  // the node a segment touches, if it's the first or last of its edge
  const endNodes = (e: number, i: number): string[] => [
    ...(i === 0 ? [k.code[e].n] : []),
    ...(i === SAMPLES - 1 ? [k.code[(e + 1) % V].n] : []),
  ];
  let stray = 0;
  for (let e1 = 0; e1 < V; e1++) {
    for (let e2 = e1; e2 < V; e2++) {
      if (!overlapsXYWH(edgeBoxes[e1], edgeBoxes[e2], 1e-6)) continue;
      for (let i = 0; i < SAMPLES; i++) {
        // (neighboring segments of one edge share an end point)
        for (let j = e1 === e2 ? i + 2 : 0; j < SAMPLES; j++) {
          if (!overlapsXYWH(segBoxes[e1][i], segBoxes[e2][j], 1e-6)) continue;
          const p = pts[e1][i];
          const q = pts[e1][i + 1];
          const h = segHit(p, q, pts[e2][j], pts[e2][j + 1]);
          if (!h) continue;
          // crossing at a node the two segments both end at is fine
          const X = p.lerp(q, h.t);
          const shared = endNodes(e2, j);
          const ok = endNodes(e1, i).some(
            (id) => shared.includes(id) && X.dist(k.nodes[id]) < 1.5,
          );
          if (!ok && ++stray >= limit) return stray;
        }
      }
    }
  }
  return stray;
}

// # Invariants

type CrossingVisit = { id: string; over: boolean };
type Combo = {
  cv: CrossingVisit[];
  crossings: { id: string; overK: number; underK: number; sign: 1 | -1 }[];
};

function combo(k: Knot): Combo {
  const cv: CrossingVisit[] = [];
  for (const v of k.code) {
    if (k.nodes[v.n].kind === "x") cv.push({ id: v.n, over: v.over });
  }
  const byId = new Map<string, { overK: number; underK: number }>();
  cv.forEach((v, i) => {
    const entry = byId.get(v.id) ?? { overK: -1, underK: -1 };
    if (v.over) entry.overK = i;
    else entry.underK = i;
    byId.set(v.id, entry);
  });
  const crossings = [...byId.entries()].map(([id, e]) => ({
    id,
    ...e,
    sign: k.nodes[id].sign,
  }));
  return { cv, crossings };
}

/** Arc containing crossing-visit index i: named by its starting under-visit. */
function arcOfCv(cb: Combo, i: number): string {
  const n = cb.cv.length;
  for (let s = 0; s < n; s++) {
    const v = cb.cv[cyc(i - s, n)];
    if (!v.over) return v.id;
  }
  return "root";
}

/** Arc that the edge leaving visit i belongs to. */
export function arcOfEdge(k: Knot, i: number): string {
  const V = k.code.length;
  for (let s = 0; s < V; s++) {
    const v = k.code[cyc(i - s, V)];
    if (k.nodes[v.n].kind === "x" && !v.over) return v.n;
  }
  return "root";
}

export type Invariants = {
  n: number;
  writhe: number;
  tricolorable: boolean;
  arcColor: Map<string, number>; // arc id → 0/1/2
  jones: string | null; // null if too many crossings
};

function idNum(id: string): number {
  return parseInt(id.replace(/\D/g, ""), 10) || 0;
}

function tricolor(cb: Combo): { ok: boolean; colors: Map<string, number> } {
  const arcIds =
    cb.crossings.length === 0 ? ["root"] : cb.crossings.map((c) => c.id);
  arcIds.sort((a, b) => idNum(a) - idNum(b));
  const idx = new Map(arcIds.map((id, i) => [id, i]));
  const nv = arcIds.length;
  const n = cb.cv.length;
  // rows: over + underIn + underOut ≡ 0 (mod 3)
  const rows: number[][] = cb.crossings.map((c) => {
    const row = new Array(nv).fill(0);
    const over = arcOfCv(cb, c.overK);
    const underIn = arcOfCv(cb, cyc(c.underK - 1, n));
    for (const a of [over, underIn, c.id]) {
      const j = idx.get(a)!;
      row[j] = (row[j] + 1) % 3;
    }
    return row;
  });
  // Gaussian elimination mod 3
  const pivotCols: number[] = [];
  let r = 0;
  for (let c = 0; c < nv && r < rows.length; c++) {
    let pr = -1;
    for (let i = r; i < rows.length; i++) {
      if (rows[i][c] !== 0) {
        pr = i;
        break;
      }
    }
    if (pr < 0) continue;
    [rows[r], rows[pr]] = [rows[pr], rows[r]];
    const inv = rows[r][c] === 1 ? 1 : 2; // inverse mod 3
    rows[r] = rows[r].map((v) => (v * inv) % 3);
    for (let i = 0; i < rows.length; i++) {
      if (i !== r && rows[i][c] !== 0) {
        const f = rows[i][c];
        rows[i] = rows[i].map((v, j) => (((v - f * rows[r][j]) % 3) + 3) % 3);
      }
    }
    pivotCols.push(c);
    r++;
  }
  const freeCols: number[] = [];
  for (let c = 0; c < nv; c++) if (!pivotCols.includes(c)) freeCols.push(c);
  const ok = freeCols.length >= 2;
  const colors = new Map<string, number>();
  if (!ok || freeCols.length > 7) {
    for (const id of arcIds) colors.set(id, 0);
    return { ok, colors };
  }
  // enumerate free assignments; pick lexicographically smallest
  // non-constant solution (in arc-id order)
  let best: number[] | null = null;
  const total = Math.pow(3, freeCols.length);
  for (let a = 0; a < total; a++) {
    const sol = new Array(nv).fill(0);
    let aa = a;
    for (const c of freeCols) {
      sol[c] = aa % 3;
      aa = Math.floor(aa / 3);
    }
    pivotCols.forEach((c, ri) => {
      let v = 0;
      for (const fc of freeCols) v += rows[ri][fc] * sol[fc];
      sol[c] = ((-v % 3) + 3) % 3;
    });
    if (sol.every((v) => v === sol[0])) continue;
    if (best === null) {
      best = sol;
    } else {
      for (let j = 0; j < nv; j++) {
        if (sol[j] !== best[j]) {
          if (sol[j] < best[j]) best = sol;
          break;
        }
      }
    }
  }
  arcIds.forEach((id, j) => colors.set(id, best ? best[j] : 0));
  return { ok, colors };
}

// Laurent polynomials in A as Map<exponent, coeff>
type Poly = Map<number, number>;

function polyAdd(a: Poly, b: Poly): Poly {
  const out = new Map(a);
  for (const [e, c] of b) {
    const v = (out.get(e) ?? 0) + c;
    if (v === 0) out.delete(e);
    else out.set(e, v);
  }
  return out;
}

function polyMul(a: Poly, b: Poly): Poly {
  const out: Poly = new Map();
  for (const [ea, ca] of a) {
    for (const [eb, cb] of b) {
      const e = ea + eb;
      const v = (out.get(e) ?? 0) + ca * cb;
      if (v === 0) out.delete(e);
      else out.set(e, v);
    }
  }
  return out;
}

function polyPow(p: Poly, n: number): Poly {
  let out: Poly = new Map([[0, 1]]);
  for (let i = 0; i < n; i++) out = polyMul(out, p);
  return out;
}

const D_LOOP: Poly = new Map([
  [2, -1],
  [-2, -1],
]); // -A^2 - A^-2

/**
 * PD code (KnotTheory convention: each crossing lists its four edges
 * counterclockwise from the incoming under-strand; edge k runs from
 * crossing-visit k to k+1, numbered from 1).
 */
export function pdCode(k: Knot): number[][] {
  const cb = combo(k);
  const E = cb.cv.length;
  return cb.crossings.map((c) => {
    const uIn = cyc(c.underK - 1, E) + 1;
    const uOut = c.underK + 1;
    const oIn = cyc(c.overK - 1, E) + 1;
    const oOut = c.overK + 1;
    return c.sign === 1 ? [uIn, oOut, uOut, oIn] : [uIn, oIn, uOut, oOut];
  });
}

/** Kauffman bracket, normalized to the Jones polynomial (in A). */
function jonesPoly(cb: Combo): Poly | null {
  const n = cb.crossings.length;
  if (n === 0) return new Map([[0, 1]]);
  if (n > 13) return null;
  const E = 2 * n; // edges: edge k runs from crossing-visit k to k+1
  // PD: X[a,b,c,d] with a = incoming under, then counterclockwise
  const pd = cb.crossings.map((c) => {
    const uIn = cyc(c.underK - 1, E);
    const uOut = c.underK;
    const oIn = cyc(c.overK - 1, E);
    const oOut = c.overK;
    return c.sign === 1 ? [uIn, oOut, uOut, oIn] : [uIn, oIn, uOut, oOut];
  });
  let bracket: Poly = new Map();
  const parent = new Int32Array(E);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let state = 0; state < 1 << n; state++) {
    for (let e = 0; e < E; e++) parent[e] = e;
    let nA = 0;
    for (let i = 0; i < n; i++) {
      const [a, b, c, d] = pd[i];
      if (state & (1 << i)) {
        union(a, b);
        union(c, d);
        nA++;
      } else {
        union(a, d);
        union(b, c);
      }
    }
    let loops = 0;
    for (let e = 0; e < E; e++) if (find(e) === e) loops++;
    const term = polyMul(
      new Map([[nA - (n - nA), 1]]),
      polyPow(D_LOOP, loops - 1),
    );
    bracket = polyAdd(bracket, term);
  }
  // f = (-A^3)^(-w) <D>
  const w = cb.crossings.reduce((acc, c) => acc + c.sign, 0);
  const factor: Poly = new Map([[-3 * w, w % 2 === 0 ? 1 : -1]]);
  return polyMul(factor, bracket);
}

/** Format a Jones polynomial (in A) as a Laurent polynomial in t. */
export function formatJones(p: Poly): string {
  const terms = [...p.entries()]
    .map(([eA, c]) => ({ e: -eA / 4, c }))
    .sort((a, b) => b.e - a.e);
  if (terms.length === 0) return "0";
  const sup = (n: number) =>
    String(n).replace(
      /[-0-9]/g,
      (ch) => "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"["-0123456789".indexOf(ch)],
    );
  return terms
    .map(({ e, c }, i) => {
      const sign = c < 0 ? "−" : i === 0 ? "" : "+";
      const mag = Math.abs(c);
      const coef = e === 0 ? String(mag) : mag === 1 ? "" : String(mag);
      const tpart = e === 0 ? "" : e === 1 ? "t" : `t${sup(e)}`;
      return `${sign}${i === 0 && sign === "" ? "" : " "}${coef}${tpart}`;
    })
    .join(" ")
    .trim();
}

/** The signed Gauss code, ignoring pass nodes. */
export function diagramKey(k: Knot): string {
  const cb = combo(k);
  return (
    cb.cv.map((v) => `${v.id}${v.over ? "o" : "u"}`).join(",") +
    "|" +
    cb.crossings.map((c) => `${c.id}${c.sign > 0 ? "+" : "-"}`).join(",")
  );
}

const invariantsCache = new Map<string, Invariants>();

export function invariants(k: Knot): Invariants {
  const key = diagramKey(k);
  const cached = invariantsCache.get(key);
  if (cached) return cached;
  const cb = combo(k);
  const tc = tricolor(cb);
  const jp = jonesPoly(cb);
  const result: Invariants = {
    n: cb.crossings.length,
    writhe: cb.crossings.reduce((acc, c) => acc + c.sign, 0),
    tricolorable: tc.ok,
    arcColor: tc.colors,
    jones: jp ? formatJones(jp) : null,
  };
  if (invariantsCache.size > 500) invariantsCache.clear();
  invariantsCache.set(key, result);
  return result;
}

// # Building blocks for moves

function clone(k: Knot): Knot {
  return {
    nodes: { ...k.nodes },
    code: k.code.map((v) => ({ ...v })),
    edges: { ...k.edges },
    nextId: k.nextId,
  };
}

function handlesOf(c: Cubic): EdgeData {
  return { a: c[0].dist(c[1]), b: c[3].dist(c[2]) };
}

function passNode(
  p: Vec2,
  dir: Vec2,
  hint?: KNode["hint"],
  ghostOf?: string,
): KNode {
  return { kind: "p", ...p.xy(), rot: dir.angleRad(), sign: 1, hint, ghostOf };
}

function crossingNode(p: Vec2, overDir: Vec2, underDir: Vec2): KNode {
  const sign = overDir.cross(underDir) < 0 ? 1 : -1;
  return { kind: "x", ...p.xy(), rot: overDir.angleRad(), sign };
}

function clampHandle(h: number): number {
  return Math.max(MIN_HANDLE, h);
}

/**
 * Fresh ids: one per letter of `kinds` ("n" for a node, "e" for an
 * edge), plus the id counter to store afterwards.
 */
function newIds(k: Knot, kinds: string): { ids: string[]; nextId: number } {
  const ids = [...kinds].map((kind, i) => `${kind}${k.nextId + i}`);
  return { ids, nextId: k.nextId + kinds.length };
}

/**
 * A small deterministic random source (an LCG), seeded by a number or
 * by a string (hashed).
 */
export function seededRandom(seed: number | string): () => number {
  let st = seed;
  if (typeof st === "string") {
    let h = 2166136261;
    for (let i = 0; i < st.length; i++) {
      h = Math.imul(h ^ st.charCodeAt(i), 16777619);
    }
    st = h;
  }
  st = st >>> 0;
  return () => {
    st = (Math.imul(st as number, 1664525) + 1013904223) >>> 0;
    return (st as number) / 2 ** 32;
  };
}

/**
 * When a move's result has stray crossings, nudge the nodes it touched
 * (and the handles of edges at those nodes) until it doesn't. Returns
 * null if that doesn't work out.
 */
function repairLocal(
  k: Knot,
  focus: string[],
  seed: string,
  iterations = 80,
): Knot | null {
  let cur = k;
  let stray = strayCrossings(cur);
  if (stray === 0) return cur;
  const rand = seededRandom(seed);
  const focusSet = new Set(focus);
  const edgesAt = k.code
    .map((v, i) => ({ e: v.e, i }))
    .filter(
      ({ i }) =>
        focusSet.has(k.code[i].n) ||
        focusSet.has(k.code[(i + 1) % k.code.length].n),
    )
    .map(({ e }) => e);
  for (let it = 0; it < iterations; it++) {
    let next: Knot;
    if (rand() < 0.6 || edgesAt.length === 0) {
      const id = focus[Math.floor(rand() * focus.length)];
      const nd = cur.nodes[id];
      next = {
        ...cur,
        nodes: {
          ...cur.nodes,
          [id]: {
            ...nd,
            x: nd.x + (rand() - 0.5) * 32,
            y: nd.y + (rand() - 0.5) * 32,
            rot: nd.rot + (rand() - 0.5) * 0.8,
          },
        },
      };
    } else {
      const e = edgesAt[Math.floor(rand() * edgesAt.length)];
      const ed = cur.edges[e];
      next = {
        ...cur,
        edges: {
          ...cur.edges,
          [e]: {
            a: clampHandle(ed.a * (0.6 + 0.8 * rand())),
            b: clampHandle(ed.b * (0.6 + 0.8 * rand())),
          },
        },
      };
    }
    const s2 = strayCrossings(next);
    if (s2 < stray || (s2 === stray && rand() < 0.25)) {
      cur = next;
      stray = s2;
      if (stray === 0) return cur;
    }
  }
  return null;
}

/** The given nodes, plus their neighbors along the strand. */
function withNeighbors(k: Knot, ids: string[]): string[] {
  const V = k.code.length;
  const out = new Set(ids);
  k.code.forEach((v, q) => {
    if (!ids.includes(v.n)) return;
    out.add(k.code[cyc(q - 1, V)].n);
    out.add(k.code[cyc(q + 1, V)].n);
  });
  return [...out];
}

/**
 * The first valid candidate result of a move; failing that, the first
 * candidate repaired around the `near` nodes and their neighbors.
 */
function firstValid(
  candidates: Iterable<Knot>,
  near: string[],
  seed: string,
): Knot | null {
  let first: Knot | null = null;
  for (const c of candidates) {
    if (isValid(c)) return c;
    first ??= c;
  }
  return first && repairLocal(first, withNeighbors(first, near), seed, 300);
}

/** Split c into exact pieces at the points nearest `at` (in order). */
function splitNear(
  c: Cubic,
  at: Vec2[],
): { pieces: Cubic[]; splits: { pos: Vec2; dir: Vec2 }[] } {
  let prev = 0;
  const ts = at.map((p) => {
    prev = Math.min(0.98, Math.max(prev + 0.02, closestOnCubic(c, p).t));
    return prev;
  });
  const bounds = [0, ...ts, 1];
  return {
    pieces: ts.concat(1).map((t1, q) => subCubic(c, bounds[q], t1)),
    splits: ts.map((t) => ({ pos: bez(c, t), dir: bezTan(c, t) })),
  };
}

/**
 * If visits i and i+1 are at two different crossings that the strand
 * passes the same way (over both, or under both): i+1, and the other
 * visits to those two crossings.
 */
function sameLevelPair(
  k: Knot,
  i: number,
): { j: number; oA: number; oB: number } | null {
  const j = (i + 1) % k.code.length;
  const a = k.code[i];
  const b = k.code[j];
  if (a.n === b.n || a.over !== b.over) return null;
  if (k.nodes[a.n].kind !== "x" || k.nodes[b.n].kind !== "x") return null;
  return { j, oA: otherVisit(k, i), oB: otherVisit(k, j) };
}

// # Moves

export type MoveKind = "R1" | "R1-" | "R2" | "R2-" | "R3";
export type Move = {
  kind: MoveKind;
  from: Knot;
  to: Knot;
  /** For a push: where the dragged strand meets the other strand. */
  meets?: Vec2;
};

/**
 * R1 twist on the edge leaving visit i: a loop on the given side.
 * `from` is the pre-split state (two pass nodes at the edge midpoint,
 * joined by a zero-length edge that becomes the loop).
 */
function r1Twist(
  k: Knot,
  i: number,
  side: 1 | -1,
  overFirst: boolean,
): Move | null {
  const e = k.code[i].e;
  const C = edgeCubics(k)[i];
  const [L, R] = split(C, 0.5);
  const m = L[3];
  const T = bezTan(C, 0.5);
  const {
    ids: [q1, q2, c, eL, eR],
    nextId,
  } = newIds(k, "nnnee");
  const hint = { ...k.edges[e], e };

  const from = clone(k);
  from.nextId = nextId;
  from.nodes[q1] = passNode(m, T, hint, overFirst ? c : undefined);
  from.nodes[q2] = passNode(m, T, hint, overFirst ? undefined : c);
  from.code[i].e = eL;
  from.code.splice(
    i + 1,
    0,
    { n: q1, over: false, e },
    { n: q2, over: false, e: eR },
  );
  from.edges[eL] = handlesOf(L);
  from.edges[e] = { a: 0, b: 0 };
  from.edges[eR] = handlesOf(R);

  const N = T.perp().mul(side);
  const d1 = safeNorm(T.add(N));
  const d2 = safeNorm(T.sub(N));
  for (const size of [58, 44, 74, 34]) {
    const to = clone(from);
    delete to.nodes[q1];
    delete to.nodes[q2];
    to.nodes[c] = overFirst ? crossingNode(m, d1, d2) : crossingNode(m, d2, d1);
    to.code[i + 1] = { n: c, over: overFirst, e };
    to.code[i + 2] = { n: c, over: !overFirst, e: eR };
    to.edges[e] = { a: size, b: size };
    if (isValid(to)) return { kind: "R1", from, to };
  }
  return null;
}

/** R1 untwist of the loop edge leaving visit i. */
function r1Untwist(k: Knot, i: number): Move | null {
  const V = k.code.length;
  const j = (i + 1) % V;
  const v = k.code[i];
  const w = k.code[j];
  if (v.n !== w.n || k.nodes[v.n].kind !== "x") return null;
  const cn = k.nodes[v.n];
  const cp = Vec2(cn);
  const {
    ids: [p1, p2],
    nextId,
  } = newIds(k, "nn");

  const make = (
    pos1: Vec2,
    dir1: Vec2,
    pos2: Vec2,
    dir2: Vec2,
    loopEdge: EdgeData,
    otherEdge?: EdgeData,
  ): Knot => {
    const to = clone(k);
    to.nextId = nextId;
    delete to.nodes[v.n];
    to.nodes[p1] = passNode(pos1, dir1, undefined, v.over ? v.n : undefined);
    to.nodes[p2] = passNode(pos2, dir2, undefined, v.over ? undefined : v.n);
    to.code[i] = { ...to.code[i], n: p1, over: false };
    to.code[j] = { ...to.code[j], n: p2, over: false };
    to.edges[v.e] = loopEdge;
    if (otherEdge) to.edges[w.e] = otherEdge;
    return to;
  };

  if (V === 2) {
    // The last crossing: the other loop becomes a circle.
    const big = sampleCubic(edgeCubics(k)[j], 32);
    const center = Vec2(0)
      .add(...big)
      .div(big.length);
    const r = Math.max(
      30,
      big.reduce((acc, p) => acc + p.dist(center), 0) / big.length,
    );
    let turn = 0;
    for (let s = 0; s < big.length - 1; s++) {
      turn += big[s].sub(center).cross(big[s + 1].sub(big[s]));
    }
    const sgn = turn >= 0 ? 1 : -1;
    const u0 = safeNorm(cp.sub(center));
    const h = (4 / 3) * r;
    const to = make(
      center.add(u0.mul(r)),
      u0.perp().mul(sgn),
      center.sub(u0.mul(r)),
      u0.perp().mul(-sgn),
      { a: h, b: h },
      { a: h, b: h },
    );
    return isValid(to) ? { kind: "R1-", from: k, to } : null;
  }

  const T = safeNorm(dirAt(k, i).add(dirAt(k, j)));
  const to = firstValid(
    [8, 5, 12].map((half) =>
      make(cp.sub(T.mul(half)), T, cp.add(T.mul(half)), T, {
        a: (2 * half) / 3,
        b: (2 * half) / 3,
      }),
    ),
    [p1, p2],
    `R1-:${v.e}`,
  );
  return to && { kind: "R1-", from: k, to };
}

const R2_MAX = 250; // how far away a strand can be pushed across
const R2_MARGIN = 10; // keep new crossings this far from existing nodes

/**
 * R2: push the edge leaving visit i across the edge leaving visit j,
 * near parameter tf of that edge.
 */
function r2Push(
  k: Knot,
  i: number,
  j: number,
  tf: number,
  under: boolean,
): Move | null {
  const cubics = edgeCubics(k);
  const E = cubics[i];
  const F = cubics[j];
  const m = bez(E, 0.5);
  const TE = bezTan(E, 0.5);
  const f = bez(F, tf);
  const TF = bezTan(F, tf);
  let NF = TF.perp();
  if (NF.dot(f.sub(m)) < 0) NF = NF.mul(-1);
  const parallel = TE.dot(TF) > 0;
  const e = k.code[i].e;
  const fe = k.code[j].e;

  const {
    ids: [pe1, pe2, pf1, pf2, x1, x2, eP, eQ, fM, fB],
    nextId,
  } = newIds(k, "nnnnnneeee");

  const E1 = subCubic(E, 0, 0.4);
  const E2 = subCubic(E, 0.4, 0.6);
  const E3 = subCubic(E, 0.6, 1);
  const LF = cubicLen(F, 48);
  const Lf = cubicLen(subCubic(F, 0, tf), 32);
  const P = E[0];
  const Q = E[3];

  for (const W of [18, 13, 26]) {
    if (Lf - W < R2_MARGIN || LF - Lf - W < R2_MARGIN) continue;
    const f1 = paramAtLen(F, Lf - W);
    const f2 = paramAtLen(F, Lf + W);
    const F1 = subCubic(F, 0, f1);
    const F2 = subCubic(F, f1, f2);
    const F3 = subCubic(F, f2, 1);

    // E crosses F at F(f1) and F(f2); its first crossing is the one
    // nearer its start. Crossing x1 goes at F(f1), x2 at F(f2).
    const eFirstAt = parallel ? f1 : f2;
    const eSecondAt = parallel ? f2 : f1;
    const idAt = (t: number) => (t === f1 ? x1 : x2);

    // pre-split: pass nodes on E and F, exactly on the old curves; the
    // ones on the future over-strand stand in for the crossings' bridges
    const from = clone(k);
    from.nextId = nextId;
    const eHint = { ...k.edges[e], e };
    const fHint = { ...k.edges[fe], e: fe };
    const eGhost = (t: number) => (under ? undefined : idAt(t));
    const fGhost = (id: string) => (under ? id : undefined);
    from.nodes[pe1] = passNode(E1[3], bezTan(E, 0.4), eHint, eGhost(eFirstAt));
    from.nodes[pe2] = passNode(E2[3], bezTan(E, 0.6), eHint, eGhost(eSecondAt));
    from.nodes[pf1] = passNode(F1[3], bezTan(F, f1), fHint, fGhost(x1));
    from.nodes[pf2] = passNode(F2[3], bezTan(F, f2), fHint, fGhost(x2));
    from.edges[eP] = handlesOf(E1);
    from.edges[e] = handlesOf(E2);
    from.edges[eQ] = handlesOf(E3);
    from.edges[fe] = handlesOf(F1);
    from.edges[fM] = handlesOf(F2);
    from.edges[fB] = handlesOf(F3);
    const eVisits: Visit[] = [
      { n: pe1, over: false, e },
      { n: pe2, over: false, e: eQ },
    ];
    const fVisits: Visit[] = [
      { n: pf1, over: false, e: fM },
      { n: pf2, over: false, e: fB },
    ];
    from.code[i].e = eP;
    // insert at the later index first, so the earlier one stays put
    if (i > j) {
      from.code.splice(i + 1, 0, ...eVisits);
      from.code.splice(j + 1, 0, ...fVisits);
    } else {
      from.code.splice(j + 1, 0, ...fVisits);
      from.code.splice(i + 1, 0, ...eVisits);
    }

    const outward = (t: number) => {
      const n = bezTan(F, t).perp();
      return n.dot(NF) >= 0 ? n : n.mul(-1);
    };
    const nodeAt = (t: number, eDir: Vec2): KNode => {
      const p = bez(F, t);
      const fDir = bezTan(F, t);
      return under ? crossingNode(p, fDir, eDir) : crossingNode(p, eDir, fDir);
    };
    const firstPos = bez(F, eFirstAt);
    const secondPos = bez(F, eSecondAt);

    for (const H of [34, 24, 46]) {
      const to = clone(from);
      delete to.nodes[pe1];
      delete to.nodes[pe2];
      delete to.nodes[pf1];
      delete to.nodes[pf2];
      to.nodes[idAt(eFirstAt)] = nodeAt(eFirstAt, outward(eFirstAt));
      to.nodes[idAt(eSecondAt)] = nodeAt(eSecondAt, outward(eSecondAt).mul(-1));
      for (const v of to.code) {
        if (v.n === pe1) Object.assign(v, { n: idAt(eFirstAt), over: !under });
        else if (v.n === pe2)
          Object.assign(v, { n: idAt(eSecondAt), over: !under });
        else if (v.n === pf1) Object.assign(v, { n: x1, over: under });
        else if (v.n === pf2) Object.assign(v, { n: x2, over: under });
      }
      const dP = P.dist(firstPos);
      const dQ = secondPos.dist(Q);
      to.edges[eP] = {
        a: clampHandle(Math.min(k.edges[e].a, dP * 0.6)),
        b: clampHandle(dP / 3),
      };
      to.edges[e] = { a: H, b: H };
      to.edges[eQ] = {
        a: clampHandle(dQ / 3),
        b: clampHandle(Math.min(k.edges[e].b, dQ * 0.6)),
      };
      if (isValid(to)) return { kind: "R2", from, to, meets: f };
    }
  }
  return null;
}

/**
 * Pushes of the edge leaving visit i: straight out from its midpoint on
 * either side, across the first strand in that direction.
 */
function r2PushAll(k: Knot, i: number, under: boolean): Move[] {
  const cubics = edgeCubics(k);
  const m = bez(cubics[i], 0.5);
  const normal = bezTan(cubics[i], 0.5).perp();
  const samples = cubics.map((c) => sampleCubic(c, SAMPLES));
  const out: Move[] = [];
  for (const side of [1, -1]) {
    const far = m.add(normal.mul(side * R2_MAX));
    // first strand the ray from m hits (ignoring where it starts)
    let hit: { t: number; j: number; tf: number } | null = null;
    for (const [j, s] of samples.entries()) {
      for (let q = 0; q < SAMPLES; q++) {
        const h = segHit(m, far, s[q], s[q + 1]);
        if (h && h.t * R2_MAX > 4 && (!hit || h.t < hit.t)) {
          hit = { t: h.t, j, tf: (q + h.u) / SAMPLES };
        }
      }
    }
    if (!hit || hit.j === i) continue;
    const mv = r2Push(k, i, hit.j, hit.tf, under);
    if (mv) out.push(mv);
  }
  return out;
}

function otherVisit(k: Knot, i: number): number {
  const n = k.code[i].n;
  return k.code.findIndex((v, q) => q !== i && v.n === n);
}

/**
 * R2 pull: the edge leaving visit i is one side of a bigon (both its
 * ends are crossings it passes over, or both under, and the other
 * strand runs directly between the same two crossings). Pull it back.
 */
function r2Pull(k: Knot, i: number): Move | null {
  const V = k.code.length;
  const pair = sameLevelPair(k, i);
  if (!pair) return null;
  const { j, oA: oX, oB: oY } = pair;
  // the other strand must run directly between the two crossings
  if (cyc(oX + 1, V) !== oY && cyc(oY + 1, V) !== oX) return null;
  const vX = k.code[i];
  const vY = k.code[j];
  const X = k.nodes[vX.n];
  const Y = k.nodes[vY.n];

  const Xp = Vec2(X);
  const Yp = Vec2(Y);
  const sMid = edgeCubics(k)[i];
  const Ldir = safeNorm(Yp.sub(Xp));
  const bulge = bez(sMid, 0.5).sub(Xp.lerp(Yp, 0.5));
  let far = bulge.sub(Ldir.mul(bulge.dot(Ldir)));
  if (far.len() < 1) {
    const d = dirAt(k, i);
    far = d.sub(Ldir.mul(d.dot(Ldir)));
  }
  const home = safeNorm(far).mul(-1);

  const {
    ids: [xs, ys, xt, yt],
    nextId,
  } = newIds(k, "nnnn");
  const tDirX = dirAt(k, oX);
  const tDirY = dirAt(k, oY);

  // The other strand's side of the bigon, ordered from X to Y.
  const cubics = edgeCubics(k);
  const tForward = cyc(oX + 1, V) === oY;
  let tPts = sampleCubic(cubics[tForward ? oX : oY], 12);
  if (!tForward) tPts = tPts.reverse();
  const offsetAlongT = (c: number) =>
    tPts.map((p, q) => {
      const a = tPts[Math.max(0, q - 1)];
      const b = tPts[Math.min(tPts.length - 1, q + 1)];
      let nrm = safeNorm(b.sub(a)).perp();
      if (nrm.dot(home) < 0) nrm = nrm.mul(-1);
      return p.add(nrm.mul(c));
    });

  type Shape = { xsPos: Vec2; ysPos: Vec2; d1: Vec2; d2: Vec2; mid: EdgeData };
  const shapes: Shape[] = [];
  // faithful: the pulled strand follows the other strand's curve,
  // offset toward the side it came from
  for (const c of [16, 11, 24]) {
    const off = offsetAlongT(c);
    const d1 = safeNorm(off[1].sub(off[0]));
    const d2 = safeNorm(off[off.length - 1].sub(off[off.length - 2]));
    const xsPos = off[0];
    const ysPos = off[off.length - 1];
    shapes.push({
      xsPos,
      ysPos,
      d1,
      d2,
      mid: fitHandles(xsPos, d1, ysPos, d2, off.slice(1, -1), MIN_HANDLE),
    });
  }
  // simple: a straight segment offset from the crossings
  for (const c of [18, 12, 26]) {
    const xsPos = Xp.add(home.mul(c));
    const ysPos = Yp.add(home.mul(c));
    const sDir = safeNorm(ysPos.sub(xsPos));
    const h = clampHandle(xsPos.dist(ysPos) / 3);
    shapes.push({ xsPos, ysPos, d1: sDir, d2: sDir, mid: { a: h, b: h } });
  }

  const candidates = shapes.map((sh) => {
    const to = clone(k);
    to.nextId = nextId;
    delete to.nodes[vX.n];
    delete to.nodes[vY.n];
    const sOver = vX.over;
    to.nodes[xs] = passNode(
      sh.xsPos,
      sh.d1,
      undefined,
      sOver ? vX.n : undefined,
    );
    to.nodes[ys] = passNode(
      sh.ysPos,
      sh.d2,
      undefined,
      sOver ? vY.n : undefined,
    );
    to.nodes[xt] = passNode(Xp, tDirX, undefined, sOver ? undefined : vX.n);
    to.nodes[yt] = passNode(Yp, tDirY, undefined, sOver ? undefined : vY.n);
    to.code[i] = { ...to.code[i], n: xs, over: false };
    to.code[j] = { ...to.code[j], n: ys, over: false };
    to.code[oX] = { ...to.code[oX], n: xt, over: false };
    to.code[oY] = { ...to.code[oY], n: yt, over: false };
    to.edges[vX.e] = sh.mid;
    return to;
  });
  const to = firstValid(candidates, [xs, ys], `R2-:${vX.e}`);
  return to && { kind: "R2-", from: k, to };
}

/**
 * R3: the edge leaving visit i runs between crossings A and B, passing
 * over both (or under both), and a third crossing C sits next to A and
 * B on their other strands. Slide the edge across C.
 */
type Triangle = { i: number; oA: number; oB: number; a2: number; b2: number };

/**
 * Triangles with the edge leaving visit i as a side that can slide
 * (it passes over both its crossings A and B, or under both): the third
 * crossing C's visits a2 (next to A's other visit oA) and b2 (next to
 * B's other visit oB). The edge can border a triangle on each side.
 */
function trianglesAt(k: Knot, i: number): Triangle[] {
  const V = k.code.length;
  const pair = sameLevelPair(k, i);
  if (!pair) return [];
  const { j, oA, oB } = pair;
  const out: Triangle[] = [];
  for (const dA of [-1, 1]) {
    for (const dB of [-1, 1]) {
      const a2 = cyc(oA + dA, V);
      const b2 = cyc(oB + dB, V);
      if (a2 === b2 || [i, j].includes(a2) || [i, j].includes(b2)) continue;
      const cId = k.code[a2].n;
      if (
        cId === k.code[b2].n &&
        k.nodes[cId].kind === "x" &&
        cId !== k.code[i].n &&
        cId !== k.code[j].n
      ) {
        out.push({ i, oA, oB, a2, b2 });
      }
    }
  }
  return out;
}

/** R3s sliding the edge leaving visit i across a crossing. */
function r3All(k: Knot, i: number): Move[] {
  return trianglesAt(k, i)
    .map((tri) => r3With(k, tri, "strand"))
    .filter((m): m is Move => m !== null);
}

/**
 * R3s moving crossing `id` across the strand opposite it in a triangle
 * (the same move, seen from the other corner).
 */
export function crossingMovesAt(k: Knot, id: string): Move[] {
  return k.code
    .flatMap((_, i) => trianglesAt(k, i))
    .filter((tri) => k.code[tri.a2].n === id)
    .map((tri) => r3With(k, tri, "crossing"))
    .filter((m): m is Move => m !== null)
    .map(conformed);
}

/** R3 across the crossing C whose visits are a2 (next to oA) and b2 (next to oB). */
/**
 * R3 across the triangle's third crossing C. In "strand" mode the side
 * AB slides past C; in "crossing" mode C moves past AB instead (A and B
 * stay put). Either way the code changes the same way.
 */
function r3With(
  k: Knot,
  { i, oA, oB, a2, b2 }: Triangle,
  mode: "strand" | "crossing",
): Move | null {
  const V = k.code.length;
  const j = (i + 1) % V;
  const vA = k.code[i];
  const vB = k.code[j];
  const A = k.nodes[vA.n];
  const B = k.nodes[vB.n];
  const cId = k.code[a2].n;
  const C = k.nodes[cId];
  const Cp = Vec2(C);

  const swap = (code: Visit[], p: number, q: number) => {
    const tmp = { n: code[p].n, over: code[p].over };
    code[p] = { ...code[p], n: code[q].n, over: code[q].over };
    code[q] = { ...code[q], ...tmp };
  };
  const moved = new Set([vA.n, vB.n, cId]);

  const cubics = edgeCubics(k);
  /**
   * Slide the crossing at visit `o` (on strand t, next to C's visit
   * `c`) along t, past C, to `d` px beyond it on t's actual curve. It
   * keeps its angle to t, so its sign is unchanged.
   */
  const slide = (sVisit: number, o: number, c: number, d: number) => {
    const forward = cyc(o + 1, V) === c;
    const beyond = cubics[forward ? c : cyc(c - 1, V)];
    const L = cubicLen(beyond);
    if (L < 14) return null;
    const dd = Math.min(d, 0.8 * L);
    const t = paramAtLen(beyond, forward ? dd : L - dd);
    const p = bez(beyond, t);
    const tDir = bezTan(beyond, t);
    const rel = dirAt(k, sVisit).angleRad() - dirAt(k, o).angleRad();
    const sDir = Vec2.polarRad(1, tDir.angleRad() + rel);
    const node = k.code[sVisit].over
      ? crossingNode(p, sDir, tDir)
      : crossingNode(p, tDir, sDir);
    /**
     * Rebuild the strand's edges faithfully: past C they're exact
     * pieces of the old curve (split where the crossing now sits);
     * where the crossing left, the two old edges merge into one.
     */
    const fixEdges = (to: Knot) => {
      const fit = (slot: number, oldSlots: number[]) => {
        const pts = oldSlots.flatMap((q) =>
          sampleCubic(cubics[q], 8).slice(1, 8),
        );
        to.edges[to.code[slot].e] = fitHandles(
          nodePos(to, slot),
          dirAt(to, slot),
          nodePos(to, cyc(slot + 1, V)),
          dirAt(to, cyc(slot + 1, V)),
          pts,
          MIN_HANDLE,
        );
      };
      if (forward) {
        // T0 → A → C → T1  becomes  T0 → C → A' → T1
        fit(cyc(o - 1, V), [cyc(o - 1, V), o]);
        to.edges[to.code[o].e] = handlesOf(subCubic(beyond, 0, t));
        to.edges[to.code[c].e] = handlesOf(subCubic(beyond, t, 1));
      } else {
        // T0 → C → A → T1  becomes  T0 → A' → C → T1
        to.edges[to.code[cyc(c - 1, V)].e] = handlesOf(subCubic(beyond, 0, t));
        to.edges[to.code[c].e] = handlesOf(subCubic(beyond, t, 1));
        fit(o, [c, o]);
      }
    };
    return { node, fixEdges };
  };
  const reflect = (nd: KNode, f: number): KNode => ({
    ...nd,
    x: Cp.x + (Cp.x - nd.x) * f,
    y: Cp.y + (Cp.y - nd.y) * f,
  });
  type Placement = {
    a: KNode;
    b: KNode;
    c?: KNode;
    fixEdges?: (to: Knot) => void;
  };
  function* placements(): Generator<Placement> {
    if (mode === "crossing") {
      // C moves just past the strand through A and B, and A and B trade
      // places on that strand's own curve, near where C projects onto
      // it. The strand keeps its exact shape.
      const sMid = cubics[i];
      const L = cubicLen(sMid);
      const tc = Math.min(0.8, Math.max(0.2, closestOnCubic(sMid, Cp).t));
      const Lc = cubicLen(subCubic(sMid, 0, tc));
      const w = Math.min(12, L / 5);
      const tB = paramAtLen(sMid, Math.max(0, Lc - w));
      const tA = paramAtLen(sMid, Math.min(L, Lc + w));
      const m = bez(sMid, tc);
      let n = bezTan(sMid, tc).perp();
      if (n.dot(Cp.sub(m)) > 0) n = n.mul(-1); // toward the far side
      // a crossing on s at parameter t, keeping its angle to s
      const onS = (visit: number, other: number, t: number): KNode => {
        const p = bez(sMid, t);
        const sDir = bezTan(sMid, t);
        const rel = dirAt(k, other).angleRad() - dirAt(k, visit).angleRad();
        const oDir = Vec2.polarRad(1, sDir.angleRad() + rel);
        return k.code[visit].over
          ? crossingNode(p, sDir, oDir)
          : crossingNode(p, oDir, sDir);
      };
      // s after the move: S0 → B → A → S1, pieces of its old curve
      const fixS = (to: Knot) => {
        const fit = (slot: number, pts: Vec2[]) => {
          to.edges[to.code[slot].e] = fitHandles(
            nodePos(to, slot),
            dirAt(to, slot),
            nodePos(to, cyc(slot + 1, V)),
            dirAt(to, cyc(slot + 1, V)),
            pts,
            MIN_HANDLE,
          );
        };
        const inner = (c: Cubic) => sampleCubic(c, 8).slice(1, 8);
        fit(cyc(i - 1, V), [
          ...inner(cubics[cyc(i - 1, V)]),
          ...inner(subCubic(sMid, 0, tB)),
        ]);
        to.edges[to.code[i].e] = handlesOf(subCubic(sMid, tB, tA));
        fit(j, [...inner(subCubic(sMid, tA, 1)), ...inner(cubics[j])]);
      };
      for (const dist of [22, 16, 30]) {
        yield {
          a: onS(i, oA, tA),
          b: onS(j, oB, tB),
          c: { ...C, ...m.add(n.mul(dist)).xy() },
          fixEdges: fixS,
        };
      }
      return;
    }
    for (const f of [1, 0.7, 0.45]) {
      const a = slide(i, oA, a2, f * Cp.dist(A));
      const b = slide(j, oB, b2, f * Cp.dist(B));
      if (!a || !b) continue;
      yield {
        a: a.node,
        b: b.node,
        fixEdges: (to: Knot) => {
          a.fixEdges(to);
          b.fixEdges(to);
        },
      };
    }
    for (const f of [1, 0.6, 0.4]) yield { a: reflect(A, f), b: reflect(B, f) };
  }

  function* candidates(): Generator<Knot> {
    for (const placed of placements()) {
      const to = clone(k);
      swap(to.code, i, j);
      swap(to.code, oA, a2);
      swap(to.code, oB, b2);
      to.nodes[vA.n] = placed.a;
      to.nodes[vB.n] = placed.b;
      if (placed.c) to.nodes[cId] = placed.c;
      // re-fit handles at the ends of edges touching the triangle
      to.code.forEach((v, q) => {
        const n1 = v.n;
        const n2 = to.code[(q + 1) % V].n;
        if (!moved.has(n1) && !moved.has(n2)) return;
        const d = Vec2(to.nodes[n1]).dist(to.nodes[n2]);
        const ed = { ...to.edges[v.e] };
        if (moved.has(n1)) ed.a = clampHandle(d / 3);
        if (moved.has(n2)) ed.b = clampHandle(d / 3);
        to.edges[v.e] = ed;
      });
      placed.fixEdges?.(to);
      yield to;
    }
  }

  const to = firstValid(candidates(), [vA.n, vB.n, cId], `R3:${vA.e}`);
  return to && { kind: "R3", from: k, to };
}

/**
 * All Reidemeister moves available by dragging edge `e` (optionally
 * only those of the given kinds).
 */
export function movesAt(
  k: Knot,
  e: string,
  under: boolean,
  only?: MoveKind[],
): Move[] {
  const i = edgeIndex(k, e);
  if (i < 0) return [];
  const want = (kind: MoveKind) => !only || only.includes(kind);
  const candidates: (Move | null)[] = [
    ...(want("R1")
      ? [r1Twist(k, i, 1, !under), r1Twist(k, i, -1, !under)]
      : []),
    want("R1-") ? r1Untwist(k, i) : null,
    ...(want("R2") ? r2PushAll(k, i, under) : []),
    want("R2-") ? r2Pull(k, i) : null,
    ...(want("R3") ? r3All(k, i) : []),
  ];
  return candidates.filter((m): m is Move => m !== null).map(conformed);
}

// # Cleanup

/**
 * Remove the `count` visits after visit s (which must all be pass
 * nodes), merging their edges into the edge leaving s.
 */
function mergeRun(k: Knot, s: number, count: number): Knot | null {
  const V = k.code.length;
  if (count <= 0 || count >= V) return null;
  const end = cyc(s + count + 1, V);
  const runIdx: number[] = [];
  for (let q = 1; q <= count; q++) runIdx.push(cyc(s + q, V));
  const hints = runIdx.map((q) => k.nodes[k.code[q].n].hint);
  let data: EdgeData;
  // the merged edge keeps the id of the edge leaving s, unless the run
  // came from splitting an edge, which is then restored exactly
  let keepId = k.code[s].e;
  const h0 = hints[0];
  if (
    h0 &&
    hints.every((h) => h && h.a === h0.a && h.b === h0.b && h.e === h0.e)
  ) {
    data = { a: h0.a, b: h0.b };
    keepId = h0.e;
  } else {
    const cubics = edgeCubics(k);
    const pts: Vec2[] = [];
    for (let q = 0; q <= count; q++) {
      const c = cubics[cyc(s + q, V)];
      const smp = sampleCubic(c, 8);
      pts.push(...smp.slice(q === 0 ? 1 : 0, 8));
    }
    data = fitHandles(
      nodePos(k, s),
      dirAt(k, s),
      nodePos(k, end),
      dirAt(k, end),
      pts,
      MIN_HANDLE,
    );
  }
  const out = clone(k);
  const drop = new Set(runIdx);
  for (const q of runIdx) {
    delete out.nodes[k.code[q].n];
    delete out.edges[k.code[q].e];
  }
  delete out.edges[k.code[s].e];
  out.edges[keepId] = data;
  out.code = k.code
    .map((v, q) => (q === s ? { ...v, e: keepId } : { ...v }))
    .filter((_, q) => !drop.has(q));
  return out;
}

function isPassAt(k: Knot, q: number): boolean {
  return k.nodes[k.code[q].n].kind === "p";
}

/**
 * Merge pass nodes away: first runs that came from splitting an edge
 * (restored exactly), then any others (refit), as long as the result
 * stays valid. A diagram with no crossings keeps two pass nodes.
 */
export function cleanup(k0: Knot): Knot {
  let k = k0;
  const failed = new Set<string>();
  for (let guard = 0; guard < 100; guard++) {
    const V = k.code.length;
    const nCross = k.code.filter((_, q) => !isPassAt(k, q)).length;
    let progressed = false;
    for (const hintedOnly of [true, false]) {
      for (let s = 0; s < V && !progressed; s++) {
        const next = cyc(s + 1, V);
        if (!isPassAt(k, next)) continue;
        // runs start right after a non-pass node, or (with no
        // crossings) anywhere
        if (nCross > 0 && isPassAt(k, s)) continue;
        let count = 0;
        while (count < V - 1 && isPassAt(k, cyc(s + 1 + count, V))) {
          const nd = k.nodes[k.code[cyc(s + 1 + count, V)].n];
          if (hintedOnly && !nd.hint) break;
          count++;
        }
        if (nCross === 0) {
          // keep at least two nodes on an unknot
          count = Math.min(count, V - 2);
        }
        if (count === 0) continue;
        const key = `${k.code[s].n}:${count}:${hintedOnly}`;
        if (failed.has(key)) continue;
        let merged = mergeRun(k, s, count);
        if (merged && !isValid(merged)) {
          // the refit curve hits something: nudge its end nodes and
          // their neighbors a little
          const ends = [k.code[s].n, k.code[cyc(s + count + 1, V)].n];
          merged = repairLocal(
            merged,
            withNeighbors(merged, ends),
            `merge:${key}`,
            200,
          );
        }
        if (merged && isValid(merged)) {
          k = merged;
          progressed = true;
        } else {
          failed.add(key);
        }
      }
      if (progressed) break;
    }
    if (!progressed) break;
  }
  return k;
}

/**
 * A move with its pass nodes moved onto the curves cleanup will merge
 * them into (with hints that restore those curves exactly), so what
 * the drag previews is what the drop leaves.
 */
function conformed(m: Move): Move {
  const to = m.to;
  const done = cleanup(to);
  if (done === to) return m;
  const out = clone(to);
  // visits of `to` that survive cleanup, in order: done.code[r] is
  // to.code[kept[r]]
  const kept = to.code.flatMap((v, q) => (v.n in done.nodes ? [q] : []));
  const doneCubics = edgeCubics(done);
  const V = to.code.length;
  kept.forEach((s, r) => {
    const n = to.code[s].n;
    out.nodes[n] = done.nodes[n];
    const run: number[] = [];
    for (
      let q = cyc(s + 1, V);
      !(to.code[q].n in done.nodes);
      q = cyc(q + 1, V)
    ) {
      run.push(q);
    }
    const doneE = done.code[r].e;
    if (run.length === 0) {
      out.edges[to.code[s].e] = done.edges[doneE];
      return;
    }
    const { pieces, splits } = splitNear(
      doneCubics[r],
      run.map((q) => Vec2(to.nodes[to.code[q].n])),
    );
    const hint = { ...done.edges[doneE], e: doneE };
    run.forEach((q, p) => {
      const nd = to.nodes[to.code[q].n];
      out.nodes[to.code[q].n] = passNode(
        splits[p].pos,
        splits[p].dir,
        hint,
        nd.ghostOf,
      );
    });
    [s, ...run].forEach((q, p) => {
      out.edges[to.code[q].e] = handlesOf(pieces[p]);
    });
  });
  return isValid(out) ? { ...m, to: out } : m;
}

// # Construction

/**
 * Build a diagram from a closed 3D curve: the xy projection gives the
 * diagram, z decides over/under.
 */
export function knotFromParametric(
  f: (t: number) => { x: number; y: number; z: number },
  steps = 720,
): Knot {
  const raw: { x: number; y: number; z: number }[] = [];
  for (let s = 0; s < steps; s++) raw.push(f((2 * Math.PI * s) / steps));
  const M = raw.length;
  const zAt = (u: number) => {
    const s = Math.floor(u);
    return (
      raw[cyc(s, M)].z + (raw[cyc(s + 1, M)].z - raw[cyc(s, M)].z) * (u - s)
    );
  };
  return knotFromPolyline(
    raw.map((p) => Vec2(p)),
    (u, other) => zAt(u) > zAt(other),
  );
}

/**
 * Build a diagram from a closed polyline. Its self-crossings become
 * crossings; `isOver(u, other)` says whether the strand at polyline
 * parameter u passes over the one at `other` (parameters count
 * segments: u = s + t lies on segment s).
 */
export function knotFromPolyline(
  poly: Vec2[],
  isOver: (u: number, other: number) => boolean,
): Knot {
  const M = poly.length;
  const tangentAt = (u: number): Vec2 => {
    const s = Math.floor(u);
    return safeNorm(poly[cyc(s + 2, M)].sub(poly[cyc(s - 1, M)]));
  };
  const crossings = polylineSelfCrossings(poly);

  if (crossings.length === 0) {
    const half = Math.floor(M / 2);
    const P = poly[0];
    const Q = poly[half];
    const dP = tangentAt(0);
    const dQ = tangentAt(half);
    const h1 = fitHandles(P, dP, Q, dQ, poly.slice(1, half));
    const h2 = fitHandles(Q, dQ, P, dP, poly.slice(half + 1));
    return {
      nodes: { n0: passNode(P, dP), n1: passNode(Q, dQ) },
      code: [
        { n: "n0", over: false, e: "e2" },
        { n: "n1", over: false, e: "e3" },
      ],
      edges: { e2: h1, e3: h2 },
      nextId: 4,
    };
  }

  const visits = crossings.flatMap((c, ci) => [
    { u: c.u1, ci, other: c.u2 },
    { u: c.u2, ci, other: c.u1 },
  ]);
  visits.sort((a, b) => a.u - b.u);
  const nodes: Record<string, KNode> = {};
  crossings.forEach((c, ci) => {
    const overFirst = isOver(c.u1, c.u2);
    const o = tangentAt(overFirst ? c.u1 : c.u2);
    const u = tangentAt(overFirst ? c.u2 : c.u1);
    nodes[`n${ci}`] = crossingNode(c.p, o, u);
  });
  let nextId = crossings.length;
  const code: Visit[] = visits.map((v) => ({
    n: `n${v.ci}`,
    over: isOver(v.u, v.other),
    e: `e${nextId++}`,
  }));
  const k: Knot = { nodes, code, edges: {}, nextId };
  const V = code.length;
  code.forEach((v, q) => {
    const r = (q + 1) % V;
    const u0 = visits[q].u;
    let u1 = visits[r].u;
    if (u1 <= u0) u1 += M;
    const pts: Vec2[] = [];
    for (let s = Math.ceil(u0 + 0.5); s < u1 - 0.5; s++) pts.push(poly[s % M]);
    k.edges[v.e] = fitHandles(
      nodePos(k, q),
      dirAt(k, q),
      nodePos(k, r),
      dirAt(k, r),
      pts,
    );
  });
  return k;
}

/** Swap which strand passes over at crossing `id`. */
export function flipCrossing(k: Knot, id: string): Knot {
  const nd = k.nodes[id];
  const under = nd.rot - (nd.sign * Math.PI) / 2;
  return {
    ...k,
    nodes: {
      ...k.nodes,
      [id]: { ...nd, rot: under, sign: nd.sign === 1 ? -1 : 1 },
    },
    code: k.code.map((v) => (v.n === id ? { ...v, over: !v.over } : v)),
  };
}
