// Geometry helpers for the knot demo: points, cubic Béziers, segment
// intersection, and least-squares cubic fitting.

export type Pt = { x: number; y: number };
export type Cubic = [Pt, Pt, Pt, Pt];

export const pt = (x: number, y: number): Pt => ({ x, y });
export const add = (a: Pt, b: Pt): Pt => pt(a.x + b.x, a.y + b.y);
export const sub = (a: Pt, b: Pt): Pt => pt(a.x - b.x, a.y - b.y);
export const mul = (a: Pt, s: number): Pt => pt(a.x * s, a.y * s);
export const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
export const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x;
export const len = (a: Pt): number => Math.hypot(a.x, a.y);
export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerpPt = (a: Pt, b: Pt, t: number): Pt =>
  pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
export const norm = (a: Pt): Pt => {
  const l = len(a) || 1;
  return pt(a.x / l, a.y / l);
};
/** Rotate by +90° (in screen coordinates, clockwise). */
export const perp = (a: Pt): Pt => pt(-a.y, a.x);
export const unit = (angle: number): Pt => pt(Math.cos(angle), Math.sin(angle));
export const angleOf = (a: Pt): number => Math.atan2(a.y, a.x);

export function cyc(i: number, n: number): number {
  return ((i % n) + n) % n;
}

// # Cubics

export function bez(c: Cubic, t: number): Pt {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const d = 3 * mt * t * t;
  const e = t * t * t;
  return pt(
    a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x,
    a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y,
  );
}

/** Derivative of the cubic at t. */
export function bezD(c: Cubic, t: number): Pt {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const d = 3 * t * t;
  return pt(
    a * (c[1].x - c[0].x) + b * (c[2].x - c[1].x) + d * (c[3].x - c[2].x),
    a * (c[1].y - c[0].y) + b * (c[2].y - c[1].y) + d * (c[3].y - c[2].y),
  );
}

/** Unit tangent at t (falls back to the chord for degenerate cubics). */
export function bezTan(c: Cubic, t: number): Pt {
  const d = bezD(c, t);
  if (len(d) > 1e-9) return norm(d);
  return norm(sub(c[3], c[0]));
}

/** De Casteljau split at t. */
export function split(c: Cubic, t: number): [Cubic, Cubic] {
  const p01 = lerpPt(c[0], c[1], t);
  const p12 = lerpPt(c[1], c[2], t);
  const p23 = lerpPt(c[2], c[3], t);
  const p012 = lerpPt(p01, p12, t);
  const p123 = lerpPt(p12, p23, t);
  const m = lerpPt(p012, p123, t);
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

export function sampleCubic(c: Cubic, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push(bez(c, i / n));
  return out;
}

export function cubicLen(c: Cubic, n = 24): number {
  let L = 0;
  let prev = c[0];
  for (let i = 1; i <= n; i++) {
    const q = bez(c, i / n);
    L += dist(prev, q);
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
    const seg = dist(prev, q);
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
  p: Pt,
  tMin = 0,
  tMax = 1,
  n = 64,
): { t: number; p: Pt; d: number } {
  let best = { t: tMin, p: bez(c, tMin), d: Infinity };
  for (let i = 0; i <= n; i++) {
    const t = tMin + ((tMax - tMin) * i) / n;
    const q = bez(c, t);
    const d = dist(p, q);
    if (d < best.d) best = { t, p: q, d };
  }
  return best;
}

/**
 * The cubic from P (leaving along unit dP) to Q (arriving along unit
 * dQ) with handle lengths a, b.
 */
export function cubicFrom(
  P: Pt,
  dP: Pt,
  Q: Pt,
  dQ: Pt,
  a: number,
  b: number,
): Cubic {
  return [P, add(P, mul(dP, a)), sub(Q, mul(dQ, b)), Q];
}

/**
 * Least-squares handle lengths (a, b) for a cubic from P (direction dP)
 * to Q (direction dQ) passing near `pts` (ordered along the curve).
 */
export function fitHandles(
  P: Pt,
  dP: Pt,
  Q: Pt,
  dQ: Pt,
  pts: Pt[],
  minHandle = 4,
): { a: number; b: number } {
  if (pts.length === 0) {
    const d = dist(P, Q) / 3;
    return { a: Math.max(d, minHandle), b: Math.max(d, minHandle) };
  }
  // initial parameters by chord length (including the endpoints)
  const chain = [P, ...pts, Q];
  const cum = [0];
  for (let i = 1; i < chain.length; i++) {
    cum.push(cum[i - 1] + dist(chain[i - 1], chain[i]));
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
    const dd = dot(dP, dQ);
    pts.forEach((p, i) => {
      const t = ts[i];
      const mt = 1 - t;
      const al = 3 * mt * mt * t;
      const be = 3 * mt * t * t;
      const base = add(mul(P, mt * mt * mt + al), mul(Q, be + t * t * t));
      const r = sub(p, base);
      // model: base + al·a·dP − be·b·dQ
      A11 += al * al;
      A22 += be * be;
      A12 += -al * be * dd;
      r1 += al * dot(dP, r);
      r2 += -be * dot(dQ, r);
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
  p: Pt,
  p2: Pt,
  q: Pt,
  q2: Pt,
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
export type PolyCrossing = { u1: number; u2: number; p: Pt };

export function polylineSelfCrossings(s: Pt[]): PolyCrossing[] {
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
          p: lerpPt(s[m1], s[(m1 + 1) % M], h.t),
        });
      }
    }
  }
  return out;
}
