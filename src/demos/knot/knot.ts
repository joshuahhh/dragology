// Knot diagram model for the knot demo.
//
// A diagram is a closed curve (control points with stable ids, drawn
// as a Catmull-Rom spline) plus a Gauss code: the crossing visits in
// curve order, each tagged with a crossing id and over/under. The
// geometry says *where* crossings are; the code says *which* crossing
// each one is and who's on top. `analyze` pairs the two up.

import {
  Crossing,
  Pt,
  SUB,
  arcToParam,
  cumLen,
  cyc,
  cycAbs,
  cycDist,
  dist,
  findCrossings,
  lerpPt,
  paramToArc,
  pointAt,
  raySegment,
  resamplePolyline,
  sampleClosed,
  subCurve,
  tangentAt,
  walk,
} from "./geometry";

export type KPt = { id: string; x: number; y: number };
export type CodeEntry = { id: string; over: boolean };
export type Brush = { at: string | null; dx: number; dy: number };
export type Knot = {
  pts: KPt[];
  code: CodeEntry[];
  nextId: number;
  brush: Brush;
};

export const SPACING = 15; // target control-point spacing (px)
const BRUSH_R = 55; // cosmetic brush falloff radius (px along curve)

// Reidemeister move geometry
const W1 = 42; // R1 half-window
const LOOP_R = 24;
const LOOP_KX = 1.6;
const LOOP_LEAN = 16;
const W2 = 44; // R2 half-window
const R2_CLEAR = 24;
const R2_MAX = 110;
const MARGIN = 20; // beyond crossings, for untwist / pull / R3
const R3_CLEAR = 22;
const PULL_MARGIN = 12; // window margin for R2 pull
const R2_KEEP_CLEAR = 18; // new R2 crossings stay this far from old ones

const ZERO_BRUSH: Brush = { at: null, dx: 0, dy: 0 };

// # Analysis

export type Visit = { u: number; ci: number; first: boolean };

export type CrossingInfo = {
  id: string;
  cr: Crossing;
  overFirst: boolean;
  overU: number;
  underU: number;
  overK: number; // visit index of over visit
  underK: number;
  sign: 1 | -1;
};

export type Analysis = {
  knot: Knot;
  pts: Pt[]; // effective (brushed) control points
  samples: Pt[];
  cum: number[];
  crossings: Crossing[];
  visits: Visit[];
  consistent: boolean;
  infos: CrossingInfo[]; // indexed like crossings
  /** visit index → crossing info */
  visitInfo: CrossingInfo[];
};

export function effectivePts(k: Knot): Pt[] {
  const { at, dx, dy } = k.brush;
  if (at === null || (dx === 0 && dy === 0)) return k.pts;
  const i = k.pts.findIndex((p) => p.id === at);
  if (i < 0) return k.pts;
  const N = k.pts.length;
  const out: Pt[] = k.pts.map((p) => ({ x: p.x, y: p.y }));
  for (const dir of [1, -1]) {
    let d = 0;
    let j = i;
    while (true) {
      const w = d < BRUSH_R ? 0.5 * (1 + Math.cos((Math.PI * d) / BRUSH_R)) : 0;
      if (w <= 0) break;
      out[j] = { x: k.pts[j].x + dx * w, y: k.pts[j].y + dy * w };
      const jn = cyc(j + dir, N);
      d += dist(k.pts[j], k.pts[jn]);
      j = jn;
      if (j === i) break;
    }
  }
  return out;
}

function sortedVisits(crossings: Crossing[]): Visit[] {
  const visits: Visit[] = [];
  crossings.forEach((c, ci) => {
    visits.push({ u: c.u1, ci, first: true });
    visits.push({ u: c.u2, ci, first: false });
  });
  visits.sort((a, b) => a.u - b.u);
  return visits;
}

function crossingSign(samples: Pt[], overU: number, underU: number): 1 | -1 {
  const o = tangentAt(samples, overU);
  const u = tangentAt(samples, underU);
  // screen coords (y down): positive crossing iff cross(o, u) < 0
  return o.x * u.y - o.y * u.x < 0 ? 1 : -1;
}

const analysisCache = new WeakMap<Knot, Analysis>();

export function analyze(knot: Knot): Analysis {
  const cached = analysisCache.get(knot);
  if (cached) return cached;
  const result = analyzeUncached(knot);
  analysisCache.set(knot, result);
  return result;
}

function analyzeUncached(knot: Knot): Analysis {
  const pts = effectivePts(knot);
  const samples = sampleClosed(pts, SUB);
  const cum = cumLen(samples);
  const crossings = findCrossings(samples);
  const visits = sortedVisits(crossings);
  const code = knot.code;

  const kFirst: number[] = new Array(crossings.length);
  const kSecond: number[] = new Array(crossings.length);
  visits.forEach((v, k) => {
    if (v.first) kFirst[v.ci] = k;
    else kSecond[v.ci] = k;
  });

  let consistent = visits.length === code.length;
  if (consistent) {
    for (let ci = 0; ci < crossings.length; ci++) {
      const a = code[kFirst[ci]];
      const b = code[kSecond[ci]];
      if (a.id !== b.id || a.over === b.over) {
        consistent = false;
        break;
      }
    }
  }

  const infos: CrossingInfo[] = crossings.map((cr, ci) => {
    const overFirst = consistent ? code[kFirst[ci]].over : true;
    const id = consistent ? code[kFirst[ci]].id : `?${ci}`;
    const overU = overFirst ? cr.u1 : cr.u2;
    const underU = overFirst ? cr.u2 : cr.u1;
    return {
      id,
      cr,
      overFirst,
      overU,
      underU,
      overK: overFirst ? kFirst[ci] : kSecond[ci],
      underK: overFirst ? kSecond[ci] : kFirst[ci],
      sign: crossingSign(samples, overU, underU),
    };
  });
  const visitInfo = visits.map((v) => infos[v.ci]);

  return {
    knot,
    pts,
    samples,
    cum,
    crossings,
    visits,
    consistent,
    infos,
    visitInfo,
  };
}

export function isConsistent(k: Knot): boolean {
  return analyze(k).consistent;
}

// # Arcs and invariants

/**
 * Arcs are the pieces of the curve between consecutive under-visits.
 * Each arc is named by the crossing id of the under-visit it starts
 * at (or "root" if the diagram has no crossings).
 */
export function arcAt(an: Analysis, u: number): string {
  let best: CrossingInfo | null = null;
  let bestU = -Infinity;
  let last: CrossingInfo | null = null;
  let lastU = -Infinity;
  for (const info of an.infos) {
    if (info.underU <= u && info.underU > bestU) {
      best = info;
      bestU = info.underU;
    }
    if (info.underU > lastU) {
      last = info;
      lastU = info.underU;
    }
  }
  const info = best ?? last;
  return info ? info.id : "root";
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

function tricolor(an: Analysis): { ok: boolean; colors: Map<string, number> } {
  const arcIds = an.infos.length === 0 ? ["root"] : an.infos.map((i) => i.id);
  arcIds.sort((a, b) => idNum(a) - idNum(b));
  const idx = new Map(arcIds.map((id, i) => [id, i]));
  const nv = arcIds.length;
  // rows: over + underIn + underOut ≡ 0 (mod 3)
  const rows: number[][] = an.infos.map((info) => {
    const row = new Array(nv).fill(0);
    const over = arcAt(an, info.overU);
    const underOut = info.id;
    const underIn = arcAt(an, info.underU - 1e-6);
    for (const a of [over, underIn, underOut]) {
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

function polyAdd(a: Poly, b: Poly, scale = 1): Poly {
  const out = new Map(a);
  for (const [e, c] of b) {
    const v = (out.get(e) ?? 0) + c * scale;
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
export function jonesPoly(an: Analysis): Poly | null {
  const n = an.infos.length;
  if (n === 0) return new Map([[0, 1]]);
  if (n > 13) return null;
  const E = 2 * n; // edges: edge k runs from visit k to visit k+1
  // PD: X[a,b,c,d] with a = incoming under, then counterclockwise
  const pd = an.infos.map((info) => {
    const uIn = cyc(info.underK - 1, E);
    const uOut = info.underK;
    const oIn = cyc(info.overK - 1, E);
    const oOut = info.overK;
    return info.sign === 1 ? [uIn, oOut, uOut, oIn] : [uIn, oIn, uOut, oOut];
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
  const w = an.infos.reduce((acc, i) => acc + i.sign, 0);
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

/**
 * The combinatorial content of a diagram: its code plus the crossing
 * signs (in visit order). Two consistent diagrams with the same key
 * are planar-isotopic; the key is what cosmetic dragging must keep.
 */
export function diagramKey(an: Analysis): string | null {
  if (!an.consistent) return null;
  return (
    an.knot.code.map((e) => `${e.id}${e.over ? "o" : "u"}`).join(",") +
    "|" +
    an.visitInfo.map((i) => i.sign).join("")
  );
}

const invariantsCache = new Map<string, Invariants>();

export function invariants(an: Analysis): Invariants {
  // Everything here depends only on the code and the crossing signs.
  const key = diagramKey(an) ?? "inconsistent";
  const cached = invariantsCache.get(key);
  if (cached) return cached;
  const tc = tricolor(an);
  const jp = jonesPoly(an);
  const result: Invariants = {
    n: an.infos.length,
    writhe: an.infos.reduce((acc, i) => acc + i.sign, 0),
    tricolorable: tc.ok,
    arcColor: tc.colors,
    jones: jp ? formatJones(jp) : null,
  };
  if (invariantsCache.size > 500) invariantsCache.clear();
  invariantsCache.set(key, result);
  return result;
}

// # Code derivation

type NewInvolved = {
  cr: Crossing;
  changed1: boolean;
  changed2: boolean;
};
type OldInvolved = CrossingInfo & { changed1: boolean; changed2: boolean };
type Assignment = { id: string; over1: boolean; over2: boolean };
type Policy = (
  newInvolved: NewInvolved[],
  oldInvolved: OldInvolved[],
  ctx: { samples: Pt[]; old: Analysis },
) => Assignment[] | null;

function spanOf(m: number): number {
  return Math.floor(m / SUB);
}

/**
 * Build the code for `newPts`, which differs from `old` only in
 * spans in `changedSpans`. Unchanged crossings are matched by
 * segment indices; crossings touching changed spans go to `policy`.
 */
function deriveCode(
  old: Analysis,
  newPts: Pt[],
  changedSpans: Set<number>,
  policy: Policy,
  why?: (s: string) => void,
): CodeEntry[] | null {
  const samples = sampleClosed(newPts, SUB);
  const crossings = findCrossings(samples);
  const oldOutside = new Map<string, CrossingInfo>();
  const oldInvolved: OldInvolved[] = [];
  for (const info of old.infos) {
    const changed1 = changedSpans.has(spanOf(info.cr.m1));
    const changed2 = changedSpans.has(spanOf(info.cr.m2));
    if (changed1 || changed2) oldInvolved.push({ ...info, changed1, changed2 });
    else oldOutside.set(`${info.cr.m1}:${info.cr.m2}`, info);
  }
  const entries: { u: number; id: string; over: boolean }[] = [];
  const newInvolved: NewInvolved[] = [];
  let matched = 0;
  for (const cr of crossings) {
    const changed1 = changedSpans.has(spanOf(cr.m1));
    const changed2 = changedSpans.has(spanOf(cr.m2));
    if (changed1 || changed2) {
      newInvolved.push({ cr, changed1, changed2 });
    } else {
      const info = oldOutside.get(`${cr.m1}:${cr.m2}`);
      if (!info) {
        why?.(
          `unmatched new outside crossing ${cr.m1}:${cr.m2} spans ${spanOf(cr.m1)},${spanOf(cr.m2)} changed=${[...changedSpans].sort((a, b) => a - b).join(",")} old=${[...oldOutside.keys()].join(" ")}`,
        );
        return null;
      }
      matched++;
      entries.push({ u: cr.u1, id: info.id, over: info.overFirst });
      entries.push({ u: cr.u2, id: info.id, over: !info.overFirst });
    }
  }
  if (matched !== oldOutside.size) {
    why?.(`matched ${matched} of ${oldOutside.size} outside crossings`);
    return null;
  }
  const assigned = policy(newInvolved, oldInvolved, { samples, old });
  if (!assigned) return null;
  assigned.forEach((a, i) => {
    const cr = newInvolved[i].cr;
    entries.push({ u: cr.u1, id: a.id, over: a.over1 });
    entries.push({ u: cr.u2, id: a.id, over: a.over2 });
  });
  entries.sort((a, b) => a.u - b.u);
  return entries.map(({ id, over }) => ({ id, over }));
}

// # Windows and relaying

type Window = { a: number; b: number }; // interior a+1..b-1 (cyclic) moves

function windowByArc(pts: Pt[], i: number, back: number, fwd: number): Window {
  const N = pts.length;
  let a = i;
  let d = 0;
  while (d < back) {
    const an = cyc(a - 1, N);
    d += dist(pts[a], pts[an]);
    a = an;
  }
  let b = i;
  d = 0;
  while (d < fwd) {
    const bn = cyc(b + 1, N);
    d += dist(pts[b], pts[bn]);
    b = bn;
  }
  return { a, b };
}

function windowByParams(
  N: number,
  cum: number[],
  uStart: number,
  uEnd: number,
  i: number,
  margin = MARGIN,
): Window {
  const us = walk(cum, uStart, -margin);
  const ue = walk(cum, uEnd, margin);
  let a = cyc(Math.floor(us / SUB), N);
  let b = cyc(Math.ceil(ue / SUB), N);
  if (a === i) a = cyc(a - 1, N);
  if (b === i) b = cyc(b + 1, N);
  return { a, b };
}

function windowOk(w: Window, N: number, i: number): boolean {
  const size = cycDist(w.a, w.b, N);
  if (size < 2 || size > N - 3) return false;
  const di = cycDist(w.a, i, N);
  return di > 0 && di < size;
}

function changedSpansOf(w: Window, N: number): Set<number> {
  const out = new Set<number>();
  const size = cycDist(w.a, w.b, N);
  for (let k = -1; k <= size; k++) out.add(cyc(w.a + k, N));
  return out;
}

/**
 * Prepare the window for a move: make sure it has at least
 * `targetInterior` interior points by resampling the interior along
 * the current curve (keeping point i where it is). Idempotent when
 * no points need adding.
 */
function prepareWindow(
  an: Analysis,
  w: Window,
  i: number,
  targetInterior: number,
): { knot: Knot; an: Analysis; w: Window; i: number } | null {
  const knot = an.knot;
  const N = knot.pts.length;
  const size = cycDist(w.a, w.b, N);
  const interior = size - 1;
  if (interior >= targetInterior) return { knot, an, w, i };
  const { samples, cum } = an;
  const uA = w.a * SUB;
  const uI = i * SUB;
  const uB = w.b * SUB;
  const LA = cycDist(
    paramToArc(cum, uA),
    paramToArc(cum, uI),
    cum[cum.length - 1],
  );
  const LB = cycDist(
    paramToArc(cum, uI),
    paramToArc(cum, uB),
    cum[cum.length - 1],
  );
  const others = targetInterior - 1;
  const nA = Math.round((others * LA) / (LA + LB));
  const nB = others - nA;
  let nextId = knot.nextId;
  const fresh = (p: Pt): KPt => ({ id: `p${nextId++}`, x: p.x, y: p.y });
  const curveA = subCurve(samples, cum, uA, uI, nA + 2).slice(1, -1);
  const curveB = subCurve(samples, cum, uI, uB, nB + 2).slice(1, -1);
  const newPts: KPt[] = [];
  // walk from a around to a (exclusive), rebuilding the interior
  newPts.push(knot.pts[w.a]);
  curveA.forEach((p) => newPts.push(fresh(p)));
  newPts.push(knot.pts[i]);
  curveB.forEach((p) => newPts.push(fresh(p)));
  for (let k = w.b; k !== w.a; k = cyc(k + 1, N)) newPts.push(knot.pts[k]);
  // rotate so that the original pts[0] id is first, to keep code order
  const id0 = knot.pts[0].id;
  const r = Math.max(
    0,
    newPts.findIndex((p) => p.id === id0),
  );
  const rotated = [...newPts.slice(r), ...newPts.slice(0, r)];
  // The curve's shape is unchanged, so the code carries over as-is;
  // verify that the crossings still pair up (and keep their signs).
  const k2: Knot = { pts: rotated, code: knot.code, nextId, brush: ZERO_BRUSH };
  const an2 = analyze(k2);
  if (diagramKey(an2) !== diagramKey(an)) return null;
  const a2 = rotated.findIndex((p) => p.id === knot.pts[w.a].id);
  const b2 = rotated.findIndex((p) => p.id === knot.pts[w.b].id);
  const i2 = rotated.findIndex((p) => p.id === knot.pts[i].id);
  return { knot: k2, an: an2, w: { a: a2, b: b2 }, i: i2 };
}

/**
 * Relay the window's interior onto curveA (a → apex) and curveB
 * (apex → b), putting point i at the apex.
 */
function relayWindow(
  pts: KPt[],
  w: Window,
  i: number,
  curveA: Pt[],
  curveB: Pt[],
): KPt[] {
  const N = pts.length;
  const nA = cycDist(w.a, i, N) - 1;
  const nB = cycDist(i, w.b, N) - 1;
  const A = resamplePolyline(curveA, nA + 2).slice(1, -1);
  const B = resamplePolyline(curveB, nB + 2).slice(1, -1);
  const out = pts.slice();
  A.forEach((p, k) => {
    const j = cyc(w.a + 1 + k, N);
    out[j] = { ...pts[j], ...p };
  });
  const apex = curveA[curveA.length - 1];
  out[i] = { ...pts[i], ...apex };
  B.forEach((p, k) => {
    const j = cyc(i + 1 + k, N);
    out[j] = { ...pts[j], ...p };
  });
  return out;
}

function polyLen(poly: Pt[]): number {
  let L = 0;
  for (let k = 1; k < poly.length; k++) L += dist(poly[k - 1], poly[k]);
  return L;
}

// # Moves

export type MoveKind = "R1" | "R1-" | "R2" | "R2-" | "R3";
export type Move = { kind: MoveKind; from: Knot; to: Knot };

function finishMove(
  kind: MoveKind,
  prep: { knot: Knot; an: Analysis; w: Window; i: number },
  curveA: Pt[],
  curveB: Pt[],
  policy: Policy,
  extraIds: number | ((count: number) => number),
  why?: (s: string) => void,
): Move | null {
  const { knot, an, w, i } = prep;
  const N = knot.pts.length;
  const newPts = relayWindow(knot.pts, w, i, curveA, curveB);
  const changed = changedSpansOf(w, N);
  let assignedCount = 0;
  const code = deriveCode(
    an,
    newPts,
    changed,
    (nw, old, ctx) => {
      const r = policy(nw, old, ctx);
      assignedCount = r ? r.length : 0;
      return r;
    },
    why,
  );
  if (!code) {
    why?.("deriveCode null");
    return null;
  }
  const to: Knot = {
    pts: newPts,
    code,
    nextId:
      knot.nextId +
      (typeof extraIds === "function" ? extraIds(assignedCount) : extraIds),
    brush: ZERO_BRUSH,
  };
  if (!analyze(to).consistent) {
    why?.("inconsistent result");
    return null;
  }
  if (dist(knot.pts[i], newPts[i]) < 3) {
    why?.("apex too close");
    return null;
  }
  return { kind, from: knot, to };
}

function frame(A: Pt, B: Pt): { T: Pt; Nn: Pt; L: number } {
  const L = dist(A, B) || 1;
  const T = { x: (B.x - A.x) / L, y: (B.y - A.y) / L };
  return { T, Nn: { x: -T.y, y: T.x }, L };
}

function r1Twist(an: Analysis, i: number, sigma: 1 | -1): Move | null {
  const knot = an.knot;
  const N = knot.pts.length;
  const w = windowByArc(knot.pts, i, W1, W1);
  if (!windowOk(w, N, i)) return null;
  // window must be crossing-free
  const changed = changedSpansOf(w, N);
  if (
    an.infos.some(
      (info) =>
        changed.has(spanOf(info.cr.m1)) || changed.has(spanOf(info.cr.m2)),
    )
  ) {
    return null;
  }
  const A = knot.pts[w.a];
  const B = knot.pts[w.b];
  const { T, Nn } = frame(A, B);
  const base = subCurve(an.samples, an.cum, w.a * SUB, w.b * SUB, 61);
  const loop = (k: number): Pt => {
    const v = k / 60;
    const tx =
      LOOP_KX * LOOP_R * Math.sin(2 * Math.PI * v) +
      LOOP_LEAN * Math.sin(Math.PI * v) ** 2;
    const ny = sigma * LOOP_R * (1 - Math.cos(2 * Math.PI * v));
    return {
      x: base[k].x + T.x * tx + Nn.x * ny,
      y: base[k].y + T.y * tx + Nn.y * ny,
    };
  };
  const curveA: Pt[] = [];
  const curveB: Pt[] = [];
  for (let k = 0; k <= 30; k++) curveA.push(loop(k));
  for (let k = 30; k <= 60; k++) curveB.push(loop(k));
  const target = Math.round((polyLen(curveA) + polyLen(curveB)) / SPACING) - 1;
  const prep = prepareWindow(an, w, i, target);
  if (!prep) return null;
  const id = `c${prep.knot.nextId}`;
  return finishMove(
    "R1",
    prep,
    curveA,
    curveB,
    (nw, old) => {
      if (old.length !== 0 || nw.length !== 1) return null;
      if (!(nw[0].changed1 && nw[0].changed2)) return null;
      return [{ id, over1: true, over2: false }];
    },
    1,
  );
}

function r2Push(
  an: Analysis,
  i: number,
  sigma: 1 | -1,
  under: boolean,
): Move | null {
  const knot = an.knot;
  const N = knot.pts.length;
  const M = an.samples.length;
  const P = knot.pts[i];
  const tan = frame(knot.pts[cyc(i - 1, N)], knot.pts[cyc(i + 1, N)]);
  const dir = { x: sigma * tan.Nn.x, y: sigma * tan.Nn.y };
  // cast a ray from P along sigma * normal to find the neighbor strand
  const rayHit = (exclude: Set<number>): number => {
    let h = Infinity;
    for (let m = 0; m < M; m++) {
      if (exclude.has(spanOf(m))) continue;
      const t = raySegment(P, dir, an.samples[m], an.samples[(m + 1) % M]);
      if (t !== null && t < h) h = t;
    }
    return h;
  };
  let w = windowByArc(knot.pts, i, W2, W2);
  if (!windowOk(w, N, i)) return null;
  let h = rayHit(changedSpansOf(w, N));
  if (!(h > 4 && h <= R2_MAX)) return null;
  // widen the window for tall bumps, then re-check
  const half = Math.max(W2, 0.5 * (h + R2_CLEAR));
  w = windowByArc(knot.pts, i, half, half);
  if (!windowOk(w, N, i)) return null;
  const changed = changedSpansOf(w, N);
  h = rayHit(changed);
  if (!(h > 4 && h <= R2_MAX)) return null;
  if (
    an.infos.some(
      (info) =>
        changed.has(spanOf(info.cr.m1)) || changed.has(spanOf(info.cr.m2)),
    )
  ) {
    return null;
  }
  const H = h + R2_CLEAR;
  const A = knot.pts[w.a];
  const B = knot.pts[w.b];
  const fr = frame(A, B);
  const side = fr.Nn.x * dir.x + fr.Nn.y * dir.y >= 0 ? 1 : -1;
  const base = subCurve(an.samples, an.cum, w.a * SUB, w.b * SUB, 41);
  const bump = (k: number): Pt => {
    const v = k / 40;
    const ny = side * H * Math.sin(Math.PI * v) ** 2;
    return { x: base[k].x + fr.Nn.x * ny, y: base[k].y + fr.Nn.y * ny };
  };
  const curveA: Pt[] = [];
  const curveB: Pt[] = [];
  for (let k = 0; k <= 20; k++) curveA.push(bump(k));
  for (let k = 20; k <= 40; k++) curveB.push(bump(k));
  const target = Math.round((polyLen(curveA) + polyLen(curveB)) / SPACING) - 1;
  const prep = prepareWindow(an, w, i, target);
  if (!prep) return null;
  return finishMove(
    "R2",
    prep,
    curveA,
    curveB,
    (nw, old, ctx) => {
      // The window strand passes entirely over (or under) whatever it
      // now crosses, so this is an isotopy no matter how many
      // crossings appear: a plain R2 makes two; a push across a
      // crossing makes four (R2 + R2).
      if (old.length !== 0 || nw.length < 2 || nw.length % 2 !== 0) return null;
      if (!nw.every((x) => x.changed1 !== x.changed2)) return null;
      // keep the new crossings clear of existing ones along the other
      // strand, so the resulting bigon can be pulled back later
      const cum2 = cumLen(ctx.samples);
      for (const x of nw) {
        const uOut = x.changed1 ? x.cr.u2 : x.cr.u1;
        const L = paramToArc(cum2, uOut);
        const total = cum2[cum2.length - 1];
        for (const v of ctx.old.visits) {
          const Lv = paramToArc(ctx.old.cum, v.u);
          const dd = Math.abs(L - Lv);
          if (Math.min(dd, total - dd) < R2_KEEP_CLEAR) return null;
        }
      }
      return nw.map((x, k) => ({
        id: `c${prep.knot.nextId + k}`,
        over1: x.changed1 ? !under : under,
        over2: x.changed2 ? !under : under,
      }));
    },
    (count) => count,
  );
}

/** Visits immediately before and after control point i. */
function neighborVisits(
  an: Analysis,
  i: number,
): { kp: number; kn: number } | null {
  const V = an.visits.length;
  if (V === 0) return null;
  const u = i * SUB;
  let kn = an.visits.findIndex((v) => v.u > u);
  if (kn < 0) kn = 0;
  const kp = cyc(kn - 1, V);
  return { kp, kn };
}

function otherVisit(an: Analysis, k: number): number {
  const info = an.visitInfo[k];
  return info.overK === k ? info.underK : info.overK;
}

function r1Untwist(an: Analysis, i: number): Move | null {
  const knot = an.knot;
  const N = knot.pts.length;
  const nb = neighborVisits(an, i);
  if (!nb) return null;
  const { kp, kn } = nb;
  if (kp === kn || knot.code[kp].id !== knot.code[kn].id) return null;
  const id = knot.code[kp].id;
  const w = windowByParams(N, an.cum, an.visits[kp].u, an.visits[kn].u, i);
  if (!windowOk(w, N, i)) return null;
  const A = knot.pts[w.a];
  const B = knot.pts[w.b];
  const mid = lerpPt(A, B, 0.5);
  const prep = prepareWindow(an, w, i, 0);
  if (!prep) return null;
  return finishMove(
    "R1-",
    prep,
    [A, mid],
    [mid, B],
    (nw, old) => {
      if (nw.length !== 0) return null;
      if (old.length !== 1 || old[0].id !== id) return null;
      return [];
    },
    0,
  );
}

export function r2Pull(
  an: Analysis,
  i: number,
  why?: (s: string) => void,
): Move | null {
  const knot = an.knot;
  const N = knot.pts.length;
  const V = an.visits.length;
  const nb = neighborVisits(an, i);
  if (!nb) return null;
  const { kp, kn } = nb;
  const e1 = knot.code[kp];
  const e2 = knot.code[kn];
  if (kp === kn || e1.id === e2.id || e1.over !== e2.over) {
    why?.("neighbors " + JSON.stringify([e1, e2]));
    return null;
  }
  const o1 = otherVisit(an, kp);
  const o2 = otherVisit(an, kn);
  if (cycAbs(o1, o2, V) !== 1) {
    why?.("not adjacent on other strand");
    return null; // bigon: adjacent on the other strand
  }
  const w = windowByParams(
    N,
    an.cum,
    an.visits[kp].u,
    an.visits[kn].u,
    i,
    PULL_MARGIN,
  );
  if (!windowOk(w, N, i)) {
    why?.("window bad " + JSON.stringify({ w, N, i }));
    return null;
  }
  // The other strand's bigon arc, plus W's own arc, must end up on
  // the far side of the new arc. Build a bump off the chord A→B,
  // away from the bigon, tall enough to clear everything.
  const uX1 = an.visits[o1].u;
  const uX2 = an.visits[o2].u;
  const forward = cycDist(o1, o2, V) === 1; // X runs o1 → o2
  const xArc = forward
    ? subCurve(an.samples, an.cum, uX1, uX2, 16)
    : subCurve(an.samples, an.cum, uX2, uX1, 16);
  const wArc = subCurve(
    an.samples,
    an.cum,
    an.visits[kp].u,
    an.visits[kn].u,
    16,
  );
  const A = knot.pts[w.a];
  const B = knot.pts[w.b];
  const fr = frame(A, B);
  const midW = wArc[8];
  const sideW =
    Math.sign((midW.x - A.x) * fr.Nn.x + (midW.y - A.y) * fr.Nn.y) || 1;
  const n = { x: -sideW * fr.Nn.x, y: -sideW * fr.Nn.y }; // away from the bigon
  // plateau profile: smooth rise over the first 30%, flat, smooth fall
  const smooth = (t: number) => {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  };
  const profile = (v: number) =>
    Math.min(smooth(v / 0.3), smooth((1 - v) / 0.3));
  let H = R2_CLEAR;
  for (const q of xArc) {
    const rel = { x: q.x - A.x, y: q.y - A.y };
    const v = Math.min(
      0.9,
      Math.max(0.1, (rel.x * fr.T.x + rel.y * fr.T.y) / fr.L),
    );
    const dd = rel.x * n.x + rel.y * n.y;
    H = Math.max(H, (dd + R2_CLEAR) / profile(v));
  }
  const bump = (v: number): Pt => {
    const base = lerpPt(A, B, v);
    const ny = H * profile(v);
    return { x: base.x + n.x * ny, y: base.y + n.y * ny };
  };
  const curveA: Pt[] = [];
  const curveB: Pt[] = [];
  for (let k = 0; k <= 20; k++) curveA.push(bump(k / 40));
  for (let k = 20; k <= 40; k++) curveB.push(bump(k / 40));
  const prep = prepareWindow(an, w, i, 0);
  if (!prep) {
    why?.("prepare null");
    return null;
  }
  return finishMove(
    "R2-",
    prep,
    curveA,
    curveB,
    (nw, old) => {
      if (nw.length !== 0) {
        why?.("new crossings " + nw.length);
        return null;
      }
      const ids = old.map((o) => o.id).sort();
      if (ids.length !== 2 || ids.join() !== [e1.id, e2.id].sort().join()) {
        why?.("old involved " + ids.join() + " vs " + [e1.id, e2.id].join());
        return null;
      }
      return [];
    },
    0,
    why,
  );
}

function r3(an: Analysis, i: number): Move | null {
  const knot = an.knot;
  const N = knot.pts.length;
  const V = an.visits.length;
  const nb = neighborVisits(an, i);
  if (!nb) return null;
  const { kp, kn } = nb;
  const e1 = knot.code[kp];
  const e2 = knot.code[kn];
  if (kp === kn || e1.id === e2.id || e1.over !== e2.over) return null;
  const o1 = otherVisit(an, kp);
  const o2 = otherVisit(an, kn);
  // find the third crossing c adjacent to o1 (on X) and o2 (on Y)
  let cX = -1;
  for (const d1 of [-1, 1]) {
    for (const d2 of [-1, 1]) {
      const k1 = cyc(o1 + d1, V);
      const k2 = cyc(o2 + d2, V);
      if (k1 === k2) continue;
      const id = knot.code[k1].id;
      if (id === knot.code[k2].id && id !== e1.id && id !== e2.id) {
        cX = k1;
      }
    }
  }
  if (cX < 0) return null;
  const c = an.visitInfo[cX];
  const w = windowByParams(N, an.cum, an.visits[kp].u, an.visits[kn].u, i);
  if (!windowOk(w, N, i)) return null;
  const A = knot.pts[w.a];
  const B = knot.pts[w.b];
  const fr = frame(A, B);
  const cp = c.cr.p;
  const rel = { x: cp.x - A.x, y: cp.y - A.y };
  const vc = (rel.x * fr.T.x + rel.y * fr.T.y) / fr.L;
  const hc = rel.x * fr.Nn.x + rel.y * fr.Nn.y;
  if (vc <= 0.05 || vc >= 0.95) return null;
  const H = hc + Math.sign(hc) * R3_CLEAR;
  const hat = (v: number): number => {
    const d = Math.abs(v - vc);
    const wv = Math.max(vc, 1 - vc);
    return d < wv ? 0.5 * (1 + Math.cos((Math.PI * d) / wv)) : 0;
  };
  const base = subCurve(an.samples, an.cum, w.a * SUB, w.b * SUB, 81);
  const bump = (v: number): Pt => {
    const b = base[Math.round(v * 80)];
    const ny = H * hat(v);
    return { x: b.x + fr.Nn.x * ny, y: b.y + fr.Nn.y * ny };
  };
  const curveA: Pt[] = [];
  const curveB: Pt[] = [];
  for (let k = 0; k <= 20; k++) curveA.push(bump((vc * k) / 20));
  for (let k = 0; k <= 20; k++) curveB.push(bump(vc + ((1 - vc) * k) / 20));
  const target = Math.round((polyLen(curveA) + polyLen(curveB)) / SPACING) - 1;
  const prep = prepareWindow(an, w, i, target);
  if (!prep) return null;
  // re-find things in the prepared knot (visit indices may have shifted)
  const pan = prep.an;
  const pV = pan.visits.length;
  const kOf = (id: string, over: boolean) =>
    prep.knot.code.findIndex((e) => e.id === id && e.over === over);
  const p_o1 = kOf(e1.id, !e1.over);
  const p_o2 = kOf(e2.id, !e2.over);
  const p_cX = [cyc(p_o1 - 1, pV), cyc(p_o1 + 1, pV)].find(
    (k) => prep.knot.code[k].id === c.id,
  );
  const p_cY = [cyc(p_o2 - 1, pV), cyc(p_o2 + 1, pV)].find(
    (k) => prep.knot.code[k].id === c.id,
  );
  if (p_cX === undefined || p_cY === undefined || p_o1 < 0 || p_o2 < 0) {
    return null;
  }
  const uXc = pan.visits[p_cX].u;
  const uYc = pan.visits[p_cY].u;
  const sideOld1 = Math.sign(
    cycDist(uXc, pan.visits[p_o1].u, pan.samples.length) -
      pan.samples.length / 2,
  );
  const sideOld2 = Math.sign(
    cycDist(uYc, pan.visits[p_o2].u, pan.samples.length) -
      pan.samples.length / 2,
  );
  return finishMove(
    "R3",
    prep,
    curveA,
    curveB,
    (nw, old, ctx) => {
      if (nw.length !== 2) return null;
      if (!nw.every((x) => x.changed1 !== x.changed2)) return null;
      const ids = old.map((o) => o.id).sort();
      if (ids.length !== 2 || ids.join() !== [e1.id, e2.id].sort().join())
        return null;
      const Ms = ctx.samples.length;
      const out: Assignment[] = [];
      const usedIds = new Set<string>();
      for (const x of nw) {
        const uOut = x.changed1 ? x.cr.u2 : x.cr.u1;
        const onX = cycAbs(uOut, uXc, Ms) < cycAbs(uOut, uYc, Ms);
        const e = onX ? e1 : e2;
        const sideNew = Math.sign(cycDist(onX ? uXc : uYc, uOut, Ms) - Ms / 2);
        if (sideNew === (onX ? sideOld1 : sideOld2)) return null; // didn't cross c
        if (usedIds.has(e.id)) return null;
        usedIds.add(e.id);
        out.push({
          id: e.id,
          over1: x.changed1 ? e.over : !e.over,
          over2: x.changed2 ? e.over : !e.over,
        });
      }
      return out;
    },
    0,
  );
}

export function movesAt(knot: Knot, ptId: string, under: boolean): Move[] {
  const an = analyze(knot);
  if (!an.consistent) return [];
  const i = knot.pts.findIndex((p) => p.id === ptId);
  if (i < 0) return [];
  const candidates: (Move | null)[] = [
    r1Twist(an, i, 1),
    r1Twist(an, i, -1),
    r2Push(an, i, 1, under),
    r2Push(an, i, -1, under),
    r1Untwist(an, i),
    r2Pull(an, i),
    r3(an, i),
  ];
  return candidates.filter((m): m is Move => m !== null);
}

// # Resampling and presets

export function bakeBrush(k: Knot): Knot {
  if (k.brush.at === null || (k.brush.dx === 0 && k.brush.dy === 0)) return k;
  const eff = effectivePts(k);
  return {
    ...k,
    pts: k.pts.map((p, j) => ({ ...p, x: eff[j].x, y: eff[j].y })),
    brush: ZERO_BRUSH,
  };
}

/** Re-space control points evenly (keeping pts[0]); keeps the code. */
export function resampleKnot(k0: Knot): Knot {
  const k = bakeBrush(k0);
  const an = analyze(k);
  if (!an.consistent) return k;
  const total = an.cum[an.cum.length - 1];
  const count = Math.max(8, Math.round(total / SPACING));
  let nextId = k.nextId;
  const pts: KPt[] = [];
  for (let j = 0; j < count; j++) {
    const p = pointAt(an.samples, arcToParam(an.cum, (total * j) / count));
    pts.push(
      j === 0 ? { ...k.pts[0] } : { id: `p${nextId++}`, x: p.x, y: p.y },
    );
  }
  const k2: Knot = { pts, code: k.code, nextId, brush: ZERO_BRUSH };
  return diagramKey(analyze(k2)) === diagramKey(an) ? k2 : k;
}

/**
 * Build a knot from a 3D parametric curve: the xy projection gives
 * the diagram, z decides over/under.
 */
export function knotFromParametric(
  f: (t: number) => { x: number; y: number; z: number },
  steps: number,
): Knot {
  const raw = [];
  for (let j = 0; j < steps; j++) raw.push(f((2 * Math.PI * j) / steps));
  const pts: KPt[] = raw.map((p, j) => ({ id: `p${j}`, x: p.x, y: p.y }));
  const zs = raw.map((p) => p.z);
  const samples = sampleClosed(pts, SUB);
  const crossings = findCrossings(samples);
  const visits = sortedVisits(crossings);
  const zAt = (u: number) => {
    const c = u / SUB;
    const j = Math.floor(c);
    return zs[j % steps] + (zs[(j + 1) % steps] - zs[j % steps]) * (c - j);
  };
  const code: CodeEntry[] = visits.map((v) => {
    const cr = crossings[v.ci];
    const zThis = zAt(v.first ? cr.u1 : cr.u2);
    const zOther = zAt(v.first ? cr.u2 : cr.u1);
    return { id: `c${v.ci}`, over: zThis > zOther };
  });
  return resampleKnot({
    pts,
    code,
    nextId: Math.max(steps, crossings.length),
    brush: ZERO_BRUSH,
  });
}
