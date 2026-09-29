// Geometry helpers for the knot demo (on top of Vec2): cubic Béziers, segment
// intersection, and least-squares cubic fitting.

import { Vec2 } from "../../math/vec2";

export type Cubic = [Vec2, Vec2, Vec2, Vec2];

/**
 * Unit vector in v's direction, or the zero vector if v is zero.
 * (Vec2's own `norm` gives NaN there; zero-length edges are normal
 * here, e.g. the collapsed loop in a pre-split twist.)
 */
export function safeNorm(v: Vec2): Vec2 {
  const l = v.len();
  return l > 0 ? v.div(l) : Vec2(0);
}

export function cyc(i: number, n: number): number {
  return ((i % n) + n) % n;
}

// # Cubics

export function bez(c: Cubic, t: number): Vec2 {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const d = 3 * mt * t * t;
  const e = t * t * t;
  return Vec2(
    a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x,
    a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y,
  );
}

/** Derivative of the cubic at t. */
export function bezD(c: Cubic, t: number): Vec2 {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const d = 3 * t * t;
  return Vec2(
    a * (c[1].x - c[0].x) + b * (c[2].x - c[1].x) + d * (c[3].x - c[2].x),
    a * (c[1].y - c[0].y) + b * (c[2].y - c[1].y) + d * (c[3].y - c[2].y),
  );
}

/** Unit tangent at t (falls back to the chord for degenerate cubics). */
export function bezTan(c: Cubic, t: number): Vec2 {
  const d = bezD(c, t);
  if (d.len() > 1e-9) return safeNorm(d);
  return safeNorm(c[3].sub(c[0]));
}

/** De Casteljau split at t. */
export function split(c: Cubic, t: number): [Cubic, Cubic] {
  const p01 = c[0].lerp(c[1], t);
  const p12 = c[1].lerp(c[2], t);
  const p23 = c[2].lerp(c[3], t);
  const p012 = p01.lerp(p12, t);
  const p123 = p12.lerp(p23, t);
  const m = p012.lerp(p123, t);
  return [
    [c[0], p01, p012, m],
    [m, p123, p23, c[3]],
  ];
}

/** Sub-cubic between parameters t0 < t1. */
export function subCubic(c: Cubic, t0: number, t1: number): Cubic {
  const right = split(c, t0)[1];
  if (t0 >= 1) return right;
  return split(right, (t1 - t0) / (1 - t0))[0];
}

export function sampleCubic(c: Cubic, n: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) out.push(bez(c, i / n));
  return out;
}

export function cubicLen(c: Cubic, n = 24): number {
  let L = 0;
  let prev = c[0];
  for (let i = 1; i <= n; i++) {
    const q = bez(c, i / n);
    L += prev.dist(q);
    prev = q;
  }
  return L;
}

/** Parameter at which the arc length from t=0 reaches L (approximate). */
export function paramAtLen(c: Cubic, L: number, n = 48): number {
  if (L <= 0) return 0;
  let acc = 0;
  let prev = c[0];
  for (let i = 1; i <= n; i++) {
    const q = bez(c, i / n);
    const seg = prev.dist(q);
    if (acc + seg >= L) {
      const f = seg > 0 ? (L - acc) / seg : 0;
      return (i - 1 + f) / n;
    }
    acc += seg;
    prev = q;
  }
  return 1;
}

/** Closest point on the cubic to p, restricted to t ∈ [tMin, tMax]. */
export function closestOnCubic(
  c: Cubic,
  p: Vec2,
  tMin = 0,
  tMax = 1,
  n = 64,
): { t: number; p: Vec2; d: number } {
  let best = { t: tMin, p: bez(c, tMin), d: Infinity };
  for (let i = 0; i <= n; i++) {
    const t = tMin + ((tMax - tMin) * i) / n;
    const q = bez(c, t);
    const d = p.dist(q);
    if (d < best.d) best = { t, p: q, d };
  }
  return best;
}

/**
 * The cubic from P (leaving along unit dP) to Q (arriving along unit
 * dQ) with handle lengths a, b.
 */
export function cubicFrom(
  P: Vec2,
  dP: Vec2,
  Q: Vec2,
  dQ: Vec2,
  a: number,
  b: number,
): Cubic {
  return [P, P.add(dP.mul(a)), Q.sub(dQ.mul(b)), Q];
}

/**
 * Least-squares handle lengths (a, b) for a cubic from P (direction dP)
 * to Q (direction dQ) passing near `pts` (ordered along the curve).
 */
export function fitHandles(
  P: Vec2,
  dP: Vec2,
  Q: Vec2,
  dQ: Vec2,
  pts: Vec2[],
  minHandle = 4,
): { a: number; b: number } {
  if (pts.length === 0) {
    const d = P.dist(Q) / 3;
    return { a: Math.max(d, minHandle), b: Math.max(d, minHandle) };
  }
  // initial parameters by chord length (including the endpoints)
  const chain = [P, ...pts, Q];
  const cum = [0];
  for (let i = 1; i < chain.length; i++) {
    cum.push(cum[i - 1] + chain[i - 1].dist(chain[i]));
  }
  const total = cum[cum.length - 1] || 1;
  let ts = pts.map((_, i) => cum[i + 1] / total);
  let a = total / 3;
  let b = total / 3;
  for (let iter = 0; iter < 4; iter++) {
    let A11 = 0;
    let A12 = 0;
    let A22 = 0;
    let r1 = 0;
    let r2 = 0;
    const dd = dP.dot(dQ);
    pts.forEach((p, i) => {
      const t = ts[i];
      const mt = 1 - t;
      const al = 3 * mt * mt * t;
      const be = 3 * mt * t * t;
      const base = P.mul(mt * mt * mt + al).add(Q.mul(be + t * t * t));
      const r = p.sub(base);
      // model: base + al·a·dP − be·b·dQ
      A11 += al * al;
      A22 += be * be;
      A12 += -al * be * dd;
      r1 += al * dP.dot(r);
      r2 += -be * dQ.dot(r);
    });
    const det = A11 * A22 - A12 * A12;
    if (Math.abs(det) > 1e-9) {
      a = (r1 * A22 - r2 * A12) / det;
      b = (A11 * r2 - A12 * r1) / det;
    }
    a = Math.min(Math.max(a, minHandle), 4 * total);
    b = Math.min(Math.max(b, minHandle), 4 * total);
    // re-estimate parameters as closest points on the fitted curve
    const c = cubicFrom(P, dP, Q, dQ, a, b);
    ts = pts.map((p, i) => {
      const lo = Math.max(0, ts[i] - 0.25);
      const hi = Math.min(1, ts[i] + 0.25);
      return closestOnCubic(c, p, lo, hi, 24).t;
    });
  }
  return { a, b };
}

// # Segments

/** Intersection parameters of segments p→p2 and q→q2, if they cross. */
export function segHit(
  p: Vec2,
  p2: Vec2,
  q: Vec2,
  q2: Vec2,
): { t: number; u: number } | null {
  const rx = p2.x - p.x;
  const ry = p2.y - p.y;
  const sx = q2.x - q.x;
  const sy = q2.y - q.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const t = (dx * sy - dy * sx) / denom;
  const u = (dx * ry - dy * rx) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { t, u };
  return null;
}

/**
 * A self-crossing of a closed polyline between segments m1 < m2
 * (segment m runs from sample m to m+1). u1 = m1 + t1 < u2 = m2 + t2.
 */
export type PolyCrossing = { u1: number; u2: number; p: Vec2 };

export function polylineSelfCrossings(s: Vec2[]): PolyCrossing[] {
  const M = s.length;
  const out: PolyCrossing[] = [];
  for (let m1 = 0; m1 < M; m1++) {
    for (let m2 = m1 + 2; m2 < M; m2++) {
      if (m1 === 0 && m2 === M - 1) continue;
      const h = segHit(s[m1], s[(m1 + 1) % M], s[m2], s[(m2 + 1) % M]);
      if (h && h.t < 1 && h.u < 1) {
        out.push({
          u1: m1 + h.t,
          u2: m2 + h.u,
          p: s[m1].lerp(s[(m1 + 1) % M], h.t),
        });
      }
    }
  }
  return out;
}
