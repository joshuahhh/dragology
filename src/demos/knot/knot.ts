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
  Pt,
  add,
  angleOf,
  bez,
  bezTan,
  closestOnCubic,
  cross,
  cubicFrom,
  cubicLen,
  cyc,
  dist,
  dot,
  fitHandles,
  len,
  lerpPt,
  mul,
  norm,
  paramAtLen,
  perp,
  polylineSelfCrossings,
  pt,
  sampleCubic,
  segHit,
  split,
  sub,
  subCubic,
  unit,
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
  hint?: { a: number; b: number };
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

export function nodePos(k: Knot, i: number): Pt {
  const nd = k.nodes[k.code[i].n];
  return pt(nd.x, nd.y);
}

/** Direction of the strand at visit i. */
export function dirAt(k: Knot, i: number): Pt {
  const v = k.code[i];
  const nd = k.nodes[v.n];
  if (nd.kind === "p" || v.over) return unit(nd.rot);
  return unit(nd.rot - (nd.sign * Math.PI) / 2);
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
  const V = k.code.length;
  if (V === 0) return false;
  const cubics = edgeCubics(k);
  const S = SAMPLES;
  const n = V * S;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const qx = new Float64Array(n);
  const qy = new Float64Array(n);
  cubics.forEach((c, e) => {
    const s = sampleCubic(c, S);
    for (let i = 0; i < S; i++) {
      px[e * S + i] = s[i].x;
      py[e * S + i] = s[i].y;
      qx[e * S + i] = s[i + 1].x;
      qy[e * S + i] = s[i + 1].y;
    }
  });
  const minX = new Float64Array(n);
  const maxX = new Float64Array(n);
  const minY = new Float64Array(n);
  const maxY = new Float64Array(n);
  for (let s = 0; s < n; s++) {
    minX[s] = Math.min(px[s], qx[s]);
    maxX[s] = Math.max(px[s], qx[s]);
    minY[s] = Math.min(py[s], qy[s]);
    maxY[s] = Math.max(py[s], qy[s]);
  }
  // node that a segment touches at its end (if it's an end segment)
  const endNodes = (s: number): string[] => {
    const e = Math.floor(s / S);
    const i = s % S;
    const out: string[] = [];
    if (i === 0) out.push(k.code[e].n);
    if (i === S - 1) out.push(k.code[(e + 1) % V].n);
    return out;
  };
  for (let s1 = 0; s1 < n; s1++) {
    const e1 = Math.floor(s1 / S);
    for (let s2 = s1 + 1; s2 < n; s2++) {
      const e2 = Math.floor(s2 / S);
      if (e1 === e2 && s2 - s1 <= 1) continue;
      if (
        maxX[s1] < minX[s2] - 1e-6 ||
        maxX[s2] < minX[s1] - 1e-6 ||
        maxY[s1] < minY[s2] - 1e-6 ||
        maxY[s2] < minY[s1] - 1e-6
      ) {
        continue;
      }
      const h = segHit(
        pt(px[s1], py[s1]),
        pt(qx[s1], qy[s1]),
        pt(px[s2], py[s2]),
        pt(qx[s2], qy[s2]),
      );
      if (!h) continue;
      const X = pt(
        px[s1] + (qx[s1] - px[s1]) * h.t,
        py[s1] + (qy[s1] - py[s1]) * h.t,
      );
      const n1 = endNodes(s1);
      const n2 = endNodes(s2);
      const ok = n1.some(
        (id) =>
          n2.includes(id) && dist(X, pt(k.nodes[id].x, k.nodes[id].y)) < 1.5,
      );
      if (!ok) return false;
    }
  }
  return true;
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
  return { a: dist(c[0], c[1]), b: dist(c[3], c[2]) };
}

function passNode(p: Pt, dir: Pt, hint?: EdgeData): KNode {
  return { kind: "p", x: p.x, y: p.y, rot: angleOf(dir), sign: 1, hint };
}

function crossingNode(p: Pt, overDir: Pt, underDir: Pt): KNode {
  const sign = cross(overDir, underDir) < 0 ? 1 : -1;
  return { kind: "x", x: p.x, y: p.y, rot: angleOf(overDir), sign };
}

function clampHandle(h: number): number {
  return Math.max(MIN_HANDLE, h);
}

/** Insert visits after index i (handles cyclic appends). */
function insertAfter(code: Visit[], i: number, visits: Visit[]): void {
  code.splice(i + 1, 0, ...visits);
}

// # Moves

export type MoveKind = "R1" | "R1-" | "R2" | "R2-" | "R3";
export type Move = { kind: MoveKind; from: Knot; to: Knot };

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
  let nextId = k.nextId;
  const q1 = `n${nextId++}`;
  const q2 = `n${nextId++}`;
  const c = `n${nextId++}`;
  const eL = `e${nextId++}`;
  const eR = `e${nextId++}`;
  const hint = { ...k.edges[e] };

  const from = clone(k);
  from.nextId = nextId;
  from.nodes[q1] = passNode(m, T, hint);
  from.nodes[q2] = passNode(m, T, hint);
  from.code[i].e = eL;
  insertAfter(from.code, i, [
    { n: q1, over: false, e },
    { n: q2, over: false, e: eR },
  ]);
  from.edges[eL] = handlesOf(L);
  from.edges[e] = { a: 0, b: 0 };
  from.edges[eR] = handlesOf(R);

  const N = mul(perp(T), side);
  const d1 = norm(add(T, N));
  const d2 = norm(sub(T, N));
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
  const cp = pt(cn.x, cn.y);
  let nextId = k.nextId;
  const p1 = `n${nextId++}`;
  const p2 = `n${nextId++}`;

  const make = (
    pos1: Pt,
    dir1: Pt,
    pos2: Pt,
    dir2: Pt,
    loopEdge: EdgeData,
    otherEdge?: EdgeData,
  ): Knot => {
    const to = clone(k);
    to.nextId = nextId;
    delete to.nodes[v.n];
    to.nodes[p1] = passNode(pos1, dir1);
    to.nodes[p2] = passNode(pos2, dir2);
    to.code[i] = { ...to.code[i], n: p1, over: false };
    to.code[j] = { ...to.code[j], n: p2, over: false };
    to.edges[v.e] = loopEdge;
    if (otherEdge) to.edges[w.e] = otherEdge;
    return to;
  };

  if (V === 2) {
    // The last crossing: the other loop becomes a circle.
    const big = sampleCubic(edgeCubics(k)[j], 32);
    const center = mul(
      big.reduce((acc, p) => add(acc, p), pt(0, 0)),
      1 / big.length,
    );
    const r = Math.max(
      30,
      big.reduce((acc, p) => acc + dist(p, center), 0) / big.length,
    );
    let turn = 0;
    for (let s = 0; s < big.length - 1; s++) {
      turn += cross(sub(big[s], center), sub(big[s + 1], big[s]));
    }
    const sgn = turn >= 0 ? 1 : -1;
    const u0 = norm(sub(cp, center));
    const h = (4 / 3) * r;
    const to = make(
      add(center, mul(u0, r)),
      mul(perp(u0), sgn),
      sub(center, mul(u0, r)),
      mul(perp(u0), -sgn),
      { a: h, b: h },
      { a: h, b: h },
    );
    return isValid(to) ? { kind: "R1-", from: k, to } : null;
  }

  const T = norm(add(dirAt(k, i), dirAt(k, j)));
  for (const half of [8, 5, 12]) {
    const to = make(sub(cp, mul(T, half)), T, add(cp, mul(T, half)), T, {
      a: (2 * half) / 3,
      b: (2 * half) / 3,
    });
    if (isValid(to)) return { kind: "R1-", from: k, to };
  }
  return null;
}

const R2_MAX = 150; // how far away a strand can be pushed across
const R2_MARGIN = 10; // keep new crossings this far from existing nodes

function clearSight(k: Knot, a: Pt, b: Pt): boolean {
  const d = norm(sub(b, a));
  const a2 = add(a, mul(d, 3));
  const b2 = sub(b, mul(d, 3));
  if (dot(sub(b2, a2), d) <= 0) return true;
  for (const c of edgeCubics(k)) {
    const s = sampleCubic(c, SAMPLES);
    for (let i = 0; i < SAMPLES; i++) {
      if (segHit(a2, b2, s[i], s[i + 1])) return false;
    }
  }
  return true;
}

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
  let NF = perp(TF);
  if (dot(NF, sub(f, m)) < 0) NF = mul(NF, -1);
  const parallel = dot(TE, TF) > 0;
  const e = k.code[i].e;
  const fe = k.code[j].e;

  let nextId = k.nextId;
  const pe1 = `n${nextId++}`;
  const pe2 = `n${nextId++}`;
  const pf1 = `n${nextId++}`;
  const pf2 = `n${nextId++}`;
  const x1 = `n${nextId++}`;
  const x2 = `n${nextId++}`;
  const eP = `e${nextId++}`;
  const eQ = `e${nextId++}`;
  const fM = `e${nextId++}`;
  const fB = `e${nextId++}`;

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

    // pre-split: pass nodes on E and F, exactly on the old curves
    const from = clone(k);
    from.nextId = nextId;
    const eHint = { ...k.edges[e] };
    const fHint = { ...k.edges[fe] };
    from.nodes[pe1] = passNode(E1[3], bezTan(E, 0.4), eHint);
    from.nodes[pe2] = passNode(E2[3], bezTan(E, 0.6), eHint);
    from.nodes[pf1] = passNode(F1[3], bezTan(F, f1), fHint);
    from.nodes[pf2] = passNode(F2[3], bezTan(F, f2), fHint);
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
    if (i > j) {
      insertAfter(from.code, i, eVisits);
      insertAfter(from.code, j, fVisits);
    } else {
      insertAfter(from.code, j, fVisits);
      insertAfter(from.code, i, eVisits);
    }

    // E crosses F at F(f1) and F(f2); its first crossing is the one
    // nearer its start
    const eFirstAt = parallel ? f1 : f2;
    const eSecondAt = parallel ? f2 : f1;
    const outward = (t: number) => {
      const n = perp(bezTan(F, t));
      return dot(n, NF) >= 0 ? n : mul(n, -1);
    };
    const nodeAt = (t: number, eDir: Pt): KNode => {
      const p = bez(F, t);
      const fDir = bezTan(F, t);
      return under ? crossingNode(p, fDir, eDir) : crossingNode(p, eDir, fDir);
    };
    // which crossing id goes where: x1 at F(f1), x2 at F(f2)
    const idAt = (t: number) => (t === f1 ? x1 : x2);
    const firstPos = bez(F, eFirstAt);
    const secondPos = bez(F, eSecondAt);

    for (const H of [34, 24, 46]) {
      const to = clone(from);
      delete to.nodes[pe1];
      delete to.nodes[pe2];
      delete to.nodes[pf1];
      delete to.nodes[pf2];
      to.nodes[idAt(eFirstAt)] = nodeAt(eFirstAt, outward(eFirstAt));
      to.nodes[idAt(eSecondAt)] = nodeAt(
        eSecondAt,
        mul(outward(eSecondAt), -1),
      );
      for (const v of to.code) {
        if (v.n === pe1) Object.assign(v, { n: idAt(eFirstAt), over: !under });
        else if (v.n === pe2)
          Object.assign(v, { n: idAt(eSecondAt), over: !under });
        else if (v.n === pf1) Object.assign(v, { n: x1, over: under });
        else if (v.n === pf2) Object.assign(v, { n: x2, over: under });
      }
      const dP = dist(P, firstPos);
      const dQ = dist(secondPos, Q);
      to.edges[eP] = {
        a: clampHandle(Math.min(k.edges[e].a, dP * 0.6)),
        b: clampHandle(dP / 3),
      };
      to.edges[e] = { a: H, b: H };
      to.edges[eQ] = {
        a: clampHandle(dQ / 3),
        b: clampHandle(Math.min(k.edges[e].b, dQ * 0.6)),
      };
      if (isValid(to)) return { kind: "R2", from, to };
    }
  }
  return null;
}

function r2PushAll(k: Knot, i: number, under: boolean): Move[] {
  const cubics = edgeCubics(k);
  const m = bez(cubics[i], 0.5);
  const out: Move[] = [];
  cubics.forEach((F, j) => {
    if (j === i) return;
    const LF = cubicLen(F, 48);
    const lo = paramAtLen(F, 30);
    const hi = paramAtLen(F, LF - 30);
    if (hi <= lo) return;
    const cl = closestOnCubic(F, m, lo, hi);
    if (cl.d > R2_MAX || cl.d < 4) return;
    if (!clearSight(k, m, cl.p)) return;
    const mv = r2Push(k, i, j, cl.t, under);
    if (mv) out.push(mv);
  });
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
  const j = (i + 1) % V;
  const vX = k.code[i];
  const vY = k.code[j];
  const X = k.nodes[vX.n];
  const Y = k.nodes[vY.n];
  if (X.kind !== "x" || Y.kind !== "x" || vX.n === vY.n) return null;
  if (vX.over !== vY.over) return null;
  const oX = otherVisit(k, i);
  const oY = otherVisit(k, j);
  if (cyc(oX + 1, V) !== oY && cyc(oY + 1, V) !== oX) return null;

  const Xp = pt(X.x, X.y);
  const Yp = pt(Y.x, Y.y);
  const sMid = edgeCubics(k)[i];
  const Ldir = norm(sub(Yp, Xp));
  const bulge = sub(bez(sMid, 0.5), lerpPt(Xp, Yp, 0.5));
  let far = sub(bulge, mul(Ldir, dot(bulge, Ldir)));
  if (len(far) < 1) {
    const d = dirAt(k, i);
    far = sub(d, mul(Ldir, dot(d, Ldir)));
  }
  const home = mul(norm(far), -1);

  let nextId = k.nextId;
  const xs = `n${nextId++}`;
  const ys = `n${nextId++}`;
  const xt = `n${nextId++}`;
  const yt = `n${nextId++}`;
  const tDirX = dirAt(k, oX);
  const tDirY = dirAt(k, oY);

  for (const c of [18, 12, 26]) {
    const to = clone(k);
    to.nextId = nextId;
    delete to.nodes[vX.n];
    delete to.nodes[vY.n];
    const xsPos = add(Xp, mul(home, c));
    const ysPos = add(Yp, mul(home, c));
    const sDir = norm(sub(ysPos, xsPos));
    to.nodes[xs] = passNode(xsPos, sDir);
    to.nodes[ys] = passNode(ysPos, sDir);
    to.nodes[xt] = passNode(Xp, tDirX);
    to.nodes[yt] = passNode(Yp, tDirY);
    to.code[i] = { ...to.code[i], n: xs, over: false };
    to.code[j] = { ...to.code[j], n: ys, over: false };
    to.code[oX] = { ...to.code[oX], n: xt, over: false };
    to.code[oY] = { ...to.code[oY], n: yt, over: false };
    const h = clampHandle(dist(xsPos, ysPos) / 3);
    to.edges[vX.e] = { a: h, b: h };
    if (isValid(to)) return { kind: "R2-", from: k, to };
  }
  return null;
}

/**
 * R3: the edge leaving visit i runs between crossings A and B, passing
 * over both (or under both), and a third crossing C sits next to A and
 * B on their other strands. Slide the edge across C.
 */
function r3(k: Knot, i: number): Move | null {
  const V = k.code.length;
  const j = (i + 1) % V;
  const vA = k.code[i];
  const vB = k.code[j];
  const A = k.nodes[vA.n];
  const B = k.nodes[vB.n];
  if (A.kind !== "x" || B.kind !== "x" || vA.n === vB.n) return null;
  if (vA.over !== vB.over) return null;
  const oA = otherVisit(k, i);
  const oB = otherVisit(k, j);
  let a2 = -1;
  let b2 = -1;
  for (const dA of [-1, 1]) {
    for (const dB of [-1, 1]) {
      const qa = cyc(oA + dA, V);
      const qb = cyc(oB + dB, V);
      if (qa === qb || [i, j].includes(qa) || [i, j].includes(qb)) continue;
      const cId = k.code[qa].n;
      if (
        cId === k.code[qb].n &&
        k.nodes[cId].kind === "x" &&
        cId !== vA.n &&
        cId !== vB.n
      ) {
        a2 = qa;
        b2 = qb;
      }
    }
  }
  if (a2 < 0) return null;
  const cId = k.code[a2].n;
  const C = k.nodes[cId];
  const Cp = pt(C.x, C.y);

  const swap = (code: Visit[], p: number, q: number) => {
    const tmp = { n: code[p].n, over: code[p].over };
    code[p] = { ...code[p], n: code[q].n, over: code[q].over };
    code[q] = { ...code[q], ...tmp };
  };
  const moved = new Set([vA.n, vB.n, cId]);

  for (const f of [1, 0.8, 1.25]) {
    const to = clone(k);
    swap(to.code, i, j);
    swap(to.code, oA, a2);
    swap(to.code, oB, b2);
    to.nodes[vA.n] = {
      ...A,
      x: Cp.x + (Cp.x - A.x) * f,
      y: Cp.y + (Cp.y - A.y) * f,
    };
    to.nodes[vB.n] = {
      ...B,
      x: Cp.x + (Cp.x - B.x) * f,
      y: Cp.y + (Cp.y - B.y) * f,
    };
    // re-fit handles at the ends of edges touching the triangle
    to.code.forEach((v, q) => {
      const r = (q + 1) % V;
      const n1 = v.n;
      const n2 = to.code[r].n;
      if (!moved.has(n1) && !moved.has(n2)) return;
      const d = dist(
        pt(to.nodes[n1].x, to.nodes[n1].y),
        pt(to.nodes[n2].x, to.nodes[n2].y),
      );
      const ed = { ...to.edges[v.e] };
      if (moved.has(n1)) ed.a = clampHandle(d / 3);
      if (moved.has(n2)) ed.b = clampHandle(d / 3);
      to.edges[v.e] = ed;
    });
    if (isValid(to)) return { kind: "R3", from: k, to };
  }
  return null;
}

/** All Reidemeister moves available by dragging edge `e`. */
export function movesAt(k: Knot, e: string, under: boolean): Move[] {
  const i = edgeIndex(k, e);
  if (i < 0) return [];
  const candidates: (Move | null)[] = [
    r1Twist(k, i, 1, !under),
    r1Twist(k, i, -1, !under),
    r1Untwist(k, i),
    ...r2PushAll(k, i, under),
    r2Pull(k, i),
    r3(k, i),
  ];
  return candidates.filter((m): m is Move => m !== null);
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
  if (
    hints.every(
      (h) => h && hints[0] && h.a === hints[0].a && h.b === hints[0].b,
    )
  ) {
    data = { ...hints[0]! };
  } else {
    const cubics = edgeCubics(k);
    const pts: Pt[] = [];
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
  out.edges[k.code[s].e] = data;
  out.code = k.code.filter((_, q) => !drop.has(q)).map((v) => ({ ...v }));
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
        const merged = mergeRun(k, s, count);
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
  const poly = raw.map((p) => pt(p.x, p.y));
  const M = poly.length;
  const tangentAt = (u: number): Pt => {
    const s = Math.floor(u);
    return norm(sub(poly[cyc(s + 2, M)], poly[cyc(s - 1, M)]));
  };
  const zAt = (u: number) => {
    const s = Math.floor(u);
    return (
      raw[cyc(s, M)].z + (raw[cyc(s + 1, M)].z - raw[cyc(s, M)].z) * (u - s)
    );
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
    const overFirst = zAt(c.u1) > zAt(c.u2);
    const o = tangentAt(overFirst ? c.u1 : c.u2);
    const u = tangentAt(overFirst ? c.u2 : c.u1);
    nodes[`n${ci}`] = crossingNode(c.p, o, u);
  });
  let nextId = crossings.length;
  const code: Visit[] = visits.map((v) => ({
    n: `n${v.ci}`,
    over: zAt(v.u) > zAt(v.other),
    e: `e${nextId++}`,
  }));
  const k: Knot = { nodes, code, edges: {}, nextId };
  const V = code.length;
  code.forEach((v, q) => {
    const r = (q + 1) % V;
    const u0 = visits[q].u;
    let u1 = visits[r].u;
    if (u1 <= u0) u1 += M;
    const pts: Pt[] = [];
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
