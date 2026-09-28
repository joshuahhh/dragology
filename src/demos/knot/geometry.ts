// Planar-curve geometry for the knot demo: closed centripetal
// Catmull-Rom sampling, crossing detection, and arc-length walking on
// the sampled polyline.

export type Pt = { x: number; y: number };

/** Sub-samples per control-point span. */
export const SUB = 4;

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function cyc(i: number, n: number): number {
  return ((i % n) + n) % n;
}

/**
 * Sample a closed centripetal Catmull-Rom spline through `pts`. Span
 * `i` (from pts[i] to pts[i+1]) produces `sub` samples at indices
 * i*sub .. i*sub+sub-1; the first of them is exactly pts[i].
 */
export function sampleClosed(pts: Pt[], sub = SUB): Pt[] {
  const N = pts.length;
  const out: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const p0 = pts[cyc(i - 1, N)];
    const p1 = pts[i];
    const p2 = pts[cyc(i + 1, N)];
    const p3 = pts[cyc(i + 2, N)];
    const t0 = 0;
    const t1 = t0 + Math.max(Math.sqrt(dist(p0, p1)), 1e-3);
    const t2 = t1 + Math.max(Math.sqrt(dist(p1, p2)), 1e-3);
    const t3 = t2 + Math.max(Math.sqrt(dist(p2, p3)), 1e-3);
    for (let k = 0; k < sub; k++) {
      if (k === 0) {
        out.push({ x: p1.x, y: p1.y });
        continue;
      }
      const t = t1 + ((t2 - t1) * k) / sub;
      const A1 = lerpPt(p0, p1, (t - t0) / (t1 - t0));
      const A2 = lerpPt(p1, p2, (t - t1) / (t2 - t1));
      const A3 = lerpPt(p2, p3, (t - t2) / (t3 - t2));
      const B1 = lerpPt(A1, A2, (t - t0) / (t2 - t0));
      const B2 = lerpPt(A2, A3, (t - t1) / (t3 - t1));
      out.push(lerpPt(B1, B2, (t - t1) / (t2 - t1)));
    }
  }
  return out;
}

/**
 * A crossing between sampled segments m1 < m2 (segment m runs from
 * sample m to sample m+1, cyclically). `u1 = m1 + t1` and `u2 = m2 +
 * t2` are curve parameters in sample units, so u1 < u2 always.
 */
export type Crossing = {
  m1: number;
  t1: number;
  m2: number;
  t2: number;
  u1: number;
  u2: number;
  p: Pt;
};

export function findCrossings(s: Pt[]): Crossing[] {
  const M = s.length;
  const out: Crossing[] = [];
  // per-segment bounding boxes for a cheap prefilter
  const minX = new Float64Array(M);
  const maxX = new Float64Array(M);
  const minY = new Float64Array(M);
  const maxY = new Float64Array(M);
  for (let m = 0; m < M; m++) {
    const a = s[m];
    const b = s[(m + 1) % M];
    minX[m] = Math.min(a.x, b.x);
    maxX[m] = Math.max(a.x, b.x);
    minY[m] = Math.min(a.y, b.y);
    maxY[m] = Math.max(a.y, b.y);
  }
  for (let m1 = 0; m1 < M; m1++) {
    const p = s[m1];
    const p2 = s[(m1 + 1) % M];
    const rx = p2.x - p.x;
    const ry = p2.y - p.y;
    for (let m2 = m1 + 2; m2 < M; m2++) {
      if (m1 === 0 && m2 === M - 1) continue; // adjacent (cyclically)
      if (
        maxX[m1] < minX[m2] ||
        maxX[m2] < minX[m1] ||
        maxY[m1] < minY[m2] ||
        maxY[m2] < minY[m1]
      ) {
        continue;
      }
      const q = s[m2];
      const q2 = s[(m2 + 1) % M];
      const sx = q2.x - q.x;
      const sy = q2.y - q.y;
      const denom = rx * sy - ry * sx;
      if (Math.abs(denom) < 1e-12) continue;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const t = (dx * sy - dy * sx) / denom;
      const u = (dx * ry - dy * rx) / denom;
      if (t >= 0 && t < 1 && u >= 0 && u < 1) {
        out.push({
          m1,
          t1: t,
          m2,
          t2: u,
          u1: m1 + t,
          u2: m2 + u,
          p: { x: p.x + rx * t, y: p.y + ry * t },
        });
      }
    }
  }
  return out;
}

/** Cumulative arc length of a closed polyline; length M+1. */
export function cumLen(s: Pt[]): number[] {
  const M = s.length;
  const out = [0];
  for (let m = 0; m < M; m++) {
    out.push(out[m] + dist(s[m], s[(m + 1) % M]));
  }
  return out;
}

export function pointAt(s: Pt[], u: number): Pt {
  const M = s.length;
  const uu = cyc(u, M);
  const m = Math.floor(uu);
  return lerpPt(s[m], s[(m + 1) % M], uu - m);
}

/** Unit tangent of the segment containing parameter u. */
export function tangentAt(s: Pt[], u: number): Pt {
  const M = s.length;
  const m = Math.floor(cyc(u, M));
  const a = s[m];
  const b = s[(m + 1) % M];
  const len = dist(a, b) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

export function paramToArc(cum: number[], u: number): number {
  const M = cum.length - 1;
  const uu = cyc(u, M);
  const m = Math.floor(uu);
  return cum[m] + (cum[m + 1] - cum[m]) * (uu - m);
}

export function arcToParam(cum: number[], L: number): number {
  const M = cum.length - 1;
  const total = cum[M];
  let LL = ((L % total) + total) % total;
  // binary search for m with cum[m] <= LL < cum[m+1]
  let lo = 0;
  let hi = M;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= LL) lo = mid;
    else hi = mid;
  }
  const segLen = cum[lo + 1] - cum[lo];
  if (segLen <= 0) return lo;
  LL = Math.min(LL, cum[lo + 1]);
  return lo + (LL - cum[lo]) / segLen;
}

/** Walk `d` px of arc length (signed) from parameter u. */
export function walk(cum: number[], u: number, d: number): number {
  return arcToParam(cum, paramToArc(cum, u) + d);
}

/**
 * Sub-polyline of the closed sampled curve from parameter u0 forward
 * to u1, resampled to exactly `count` points evenly spaced in arc
 * length (including both endpoints).
 */
export function subCurve(
  s: Pt[],
  cum: number[],
  u0: number,
  u1: number,
  count: number,
): Pt[] {
  const M = s.length;
  const total = cum[M];
  const L0 = paramToArc(cum, u0);
  let L1 = paramToArc(cum, u1);
  if (L1 < L0) L1 += total;
  const out: Pt[] = [];
  for (let k = 0; k < count; k++) {
    const L = L0 + ((L1 - L0) * k) / (count - 1);
    out.push(pointAt(s, arcToParam(cum, L)));
  }
  return out;
}

/** Cyclic forward distance from u0 to u1 in a cycle of length M. */
export function cycDist(u0: number, u1: number, M: number): number {
  return cyc(u1 - u0, M);
}

/** Smallest absolute cyclic distance. */
export function cycAbs(u0: number, u1: number, M: number): number {
  const d = cycDist(u0, u1, M);
  return Math.min(d, M - d);
}

/** Points along an open polyline, evenly spaced by arc length. */
export function resamplePolyline(poly: Pt[], count: number): Pt[] {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) {
    cum.push(cum[i - 1] + dist(poly[i - 1], poly[i]));
  }
  const total = cum[cum.length - 1];
  const out: Pt[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const L = count === 1 ? 0 : (total * k) / (count - 1);
    while (j < poly.length - 2 && cum[j + 1] < L) j++;
    const segLen = cum[j + 1] - cum[j];
    const t = segLen > 0 ? Math.min(1, Math.max(0, (L - cum[j]) / segLen)) : 0;
    out.push(lerpPt(poly[j], poly[j + 1], t));
  }
  return out;
}

/** Intersection of a ray (origin o, unit dir d) with a segment a→b. */
export function raySegment(o: Pt, d: Pt, a: Pt, b: Pt): number | null {
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const denom = d.x * sy - d.y * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const dx = a.x - o.x;
  const dy = a.y - o.y;
  const t = (dx * sy - dy * sx) / denom;
  const u = (dx * d.y - dy * d.x) / denom;
  if (t > 0 && u >= 0 && u < 1) return t;
  return null;
}
