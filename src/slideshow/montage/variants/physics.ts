// The montage variants' tiles as bodies: each is an oriented rect (the box its
// clip draws in, now or over its whole loop) that packs against its
// neighbors and, in the moving variants, is pushed around by them and by a
// flow. Canvas units throughout (one stage pixel at zoom 1).

import { type Box, type ClipGeom, rampedBox } from "./clips";

export type Body = {
  clip: ClipGeom;
  /** Canvas units per video pixel */
  s: number;
  /** The tile: the clip's union box, centered at (x, y), turned by a */
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  va: number;
  /** The body: a box, in video pixels, that collides */
  box: Box;
  mass: number;
  /** Where springs pull it back to */
  homeX: number;
  homeY: number;
  homeA: number;
  /** Its lane: a preferred y (drift) or elliptical radius (vortex) */
  pref: number;
  /** Seconds into its clip at time 0 */
  phase: number;
};

export type Torus = { W: number; H: number };

export function makeBody(clip: ClipGeom, s: number, phase: number): Body {
  return {
    clip,
    s,
    x: 0,
    y: 0,
    a: 0,
    vx: 0,
    vy: 0,
    va: 0,
    box: [...clip.union] as Box,
    mass: 1,
    homeX: 0,
    homeY: 0,
    homeA: 0,
    pref: 0,
    phase,
  };
}

/** The tile's size, in canvas units */
export function tileSize(b: Body) {
  const [x0, y0, x1, y1] = b.clip.union;
  return { w: (x1 - x0) * b.s, h: (y1 - y0) * b.s };
}

/** The body box's center and half extents, in canvas units */
type Obb = {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  hx: number;
  hy: number;
};

function obb(b: Body, box: Box, out: Obb): Obb {
  const [ux0, uy0, ux1, uy1] = b.clip.union;
  const [x0, y0, x1, y1] = box;
  // the box's center relative to the tile's, unrotated
  const ox = ((x0 + x1 - ux0 - ux1) / 2) * b.s;
  const oy = ((y0 + y1 - uy0 - uy1) / 2) * b.s;
  const c = Math.cos(b.a),
    s = Math.sin(b.a);
  out.cx = b.x + c * ox - s * oy;
  out.cy = b.y + s * ox + c * oy;
  out.ux = c;
  out.uy = s;
  out.hx = Math.max(1, ((x1 - x0) / 2) * b.s);
  out.hy = Math.max(1, ((y1 - y0) / 2) * b.s);
  return out;
}

export type Contact = {
  /** How far the boxes (each grown by the margin) overlap */
  depth: number;
  /** Unit normal, from A toward B */
  nx: number;
  ny: number;
  /** Where they touch, roughly */
  px: number;
  py: number;
};

const newObb = (): Obb => ({ cx: 0, cy: 0, ux: 0, uy: 0, hx: 0, hy: 0 });
const oa = newObb(),
  ob = newObb();
const partsA = Array.from({ length: 16 }, newObb),
  partsB = Array.from({ length: 16 }, newObb);
const clipped: Box = [0, 0, 0, 0];
const pairContact: Contact = { depth: 0, nx: 0, ny: 0, px: 0, py: 0 };

/**
 * A body's parts (its mask's boxes, `ClipGeom.parts`), each cut down to the
 * body's box, so the shape is what the clip draws now; into `out`, returning
 * how many are left
 */
function partObbs(b: Body, out: Obb[]): number {
  let n = 0;
  for (const part of b.clip.parts) {
    clipped[0] = Math.max(part[0], b.box[0]);
    clipped[1] = Math.max(part[1], b.box[1]);
    clipped[2] = Math.min(part[2], b.box[2]);
    clipped[3] = Math.min(part[3], b.box[3]);
    if (clipped[2] - clipped[0] < 1 || clipped[3] - clipped[1] < 1) continue;
    obb(b, clipped, out[n++]);
  }
  return n;
}

/**
 * Whether two boxes, each grown by `margin` on every side, overlap, and if
 * so the shallowest way apart (separating axis test on the four box axes).
 */
function sat(
  oa: Obb,
  ob: Obb,
  margin: number,
  torus: Torus | null,
  out: Contact,
): Contact | null {
  let dx = ob.cx - oa.cx,
    dy = ob.cy - oa.cy;
  if (torus) {
    dx -= torus.W * Math.round(dx / torus.W);
    dy -= torus.H * Math.round(dy / torus.H);
  }
  const ahx = oa.hx + margin,
    ahy = oa.hy + margin,
    bhx = ob.hx + margin,
    bhy = ob.hy + margin;
  const reach = Math.hypot(ahx, ahy) + Math.hypot(bhx, bhy);
  if (dx * dx + dy * dy > reach * reach) return null;
  const axes = [oa.ux, oa.uy, -oa.uy, oa.ux, ob.ux, ob.uy, -ob.uy, ob.ux];
  let best = Infinity,
    nx = 0,
    ny = 0,
    ra0 = 0;
  for (let k = 0; k < 8; k += 2) {
    const ax = axes[k],
      ay = axes[k + 1];
    const ra =
      ahx * Math.abs(oa.ux * ax + oa.uy * ay) +
      ahy * Math.abs(-oa.uy * ax + oa.ux * ay);
    const rb =
      bhx * Math.abs(ob.ux * ax + ob.uy * ay) +
      bhy * Math.abs(-ob.uy * ax + ob.ux * ay);
    const d = dx * ax + dy * ay;
    const ov = ra + rb - Math.abs(d);
    if (ov <= 0) return null;
    if (ov < best) {
      best = ov;
      const sg = d < 0 ? -1 : 1;
      nx = ax * sg;
      ny = ay * sg;
      ra0 = ra;
    }
  }
  out.depth = best;
  out.nx = nx;
  out.ny = ny;
  out.px = oa.cx + nx * (ra0 - best / 2);
  out.py = oa.cy + ny * (ra0 - best / 2);
  return out;
}

/**
 * Whether two bodies, each grown by `margin` on every side, overlap, and if
 * so the shallowest way apart. A body's shape is its parts, cut down to its
 * box; where several parts overlap, the deepest overlap counts.
 */
export function collide(
  A: Body,
  B: Body,
  margin: number,
  torus: Torus | null,
  out: Contact,
): Contact | null {
  // first, whether their boxes come near at all
  if (!sat(obb(A, A.box, oa), obb(B, B.box, ob), margin, torus, out))
    return null;
  if (A.clip.parts.length <= 1 && B.clip.parts.length <= 1) return out;
  const na = partObbs(A, partsA),
    nb = partObbs(B, partsB);
  let found = false;
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < nb; j++) {
      const c = sat(partsA[i], partsB[j], margin, torus, pairContact);
      if (c && (!found || c.depth > out.depth)) {
        found = true;
        Object.assign(out, c);
      }
    }
  }
  return found ? out : null;
}

const contact: Contact = { depth: 0, nx: 0, ny: 0, px: 0, py: 0 };

/** Bring a body back into the torus's first period */
function wrap(b: Body, t: Torus) {
  b.x -= t.W * Math.floor(b.x / t.W);
  b.y -= t.H * Math.floor(b.y / t.H);
}

/** An ellipse, centered on the origin */
export type Ellipse = { A: number; B: number };

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- motion ---------------------------------------------------------------------

export type Flow = (x: number, y: number) => [number, number];

export type SimParams = {
  torus: Torus | null;
  /** Personal space: bodies push apart inside twice this */
  margin: number;
  /** Spring to the home pose (rad/s) and its damping ratio */
  home?: { w: number; zeta: number };
  /** A flow the bodies are dragged along with, and how hard (1/s) */
  flow?: Flow;
  flowGain?: number;
  /** Speeds the flow up (or down) by this, for the moment */
  flowScale?: number;
  /** Lane keeping: toward `pref`, as y on the torus or radius in the ellipse */
  lane?: { kind: "y" | "radius"; w: number; ellipse?: Ellipse };
  /** How hard bodies push apart where they crowd (rad/s, as a spring) */
  push: number;
  /**
   * Sideways give, so a body caught behind another slides around it: the
   * sideways speed (canvas units/s) each eases toward while touching
   */
  slip: number;
  /** Past this speed relative to the flow (canvas units/s), bodies drag */
  speedLimit?: number;
  /**
   * A slow, smooth sway of each body on its own, so even a still canvas
   * breathes: how hard (canvas units/s²) and roughly how slowly (s)
   */
  wander?: { force: number; period: number };
  /** The tilt spring back to the home angle (rad/s, damping ratio) */
  tilt: { w: number; zeta: number; max: number };
  /** How much a body turns with the flow's local spin (0..1) */
  spin?: number;
  /** Follow each clip's content as it changes (else bodies keep `box`) */
  live: boolean;
  /**
   * How fast a body's box may grow or shrink (canvas units/s), and how far
   * ahead and behind it looks (s): see `rampedBox`
   */
  ramp: number;
  reach: number;
};

const tmpBox: Box = [0, 0, 0, 0];

/** Where in its clip a body is at time t */
export function clipTime(b: Body, t: number) {
  const d = b.clip.duration;
  return (((t + b.phase) % d) + d) % d;
}

/** Fit each body's box to what its clip draws around time t */
export function updateBoxes(bodies: Body[], t: number, p: SimParams) {
  if (!p.live) return;
  for (const b of bodies) {
    const box = rampedBox(
      b.clip,
      clipTime(b, t),
      p.ramp / b.s,
      p.reach,
      tmpBox,
    );
    for (let k = 0; k < 4; k++) b.box[k] = box[k];
  }
}

const ax: number[] = [],
  ay: number[] = [],
  aa: number[] = [];

/** Each body's box's center and the radius it reaches, grown by a margin */
const rx: number[] = [],
  ry: number[] = [],
  rr: number[] = [];
const reachObb = newObb();

function reach(bodies: Body[], margin: number) {
  bodies.forEach((b, i) => {
    obb(b, b.box, reachObb);
    rx[i] = reachObb.cx;
    ry[i] = reachObb.cy;
    rr[i] = Math.hypot(reachObb.hx + margin, reachObb.hy + margin);
  });
}

/** Whether bodies i and j are too far apart to touch (after `reach`) */
function far(i: number, j: number, torus: Torus | null) {
  let dx = rx[j] - rx[i],
    dy = ry[j] - ry[i];
  if (torus) {
    dx -= torus.W * Math.round(dx / torus.W);
    dy -= torus.H * Math.round(dy / torus.H);
  }
  const d = rr[i] + rr[j];
  return dx * dx + dy * dy > d * d;
}

/** The flow's spin (half its vorticity) at a point, numerically */
function spinAt(flow: Flow, x: number, y: number) {
  const h = 20;
  const [, vyR] = flow(x + h, y);
  const [, vyL] = flow(x - h, y);
  const [vxU] = flow(x, y + h);
  const [vxD] = flow(x, y - h);
  return ((vyR - vyL) / (2 * h) - (vxU - vxD) / (2 * h)) / 2;
}

/**
 * Advance the bodies by dt seconds, to time t + dt. (Their boxes stay as
 * they are: `updateBoxes` them as often as the clips need, once a frame.)
 */
export function step(bodies: Body[], t: number, dt: number, p: SimParams) {
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    let fx = 0,
      fy = 0,
      fa = 0;
    if (p.home) {
      const { w, zeta } = p.home;
      let dx = b.x - b.homeX,
        dy = b.y - b.homeY;
      if (p.torus) {
        dx -= p.torus.W * Math.round(dx / p.torus.W);
        dy -= p.torus.H * Math.round(dy / p.torus.H);
      }
      fx += -w * w * dx - 2 * zeta * w * b.vx;
      fy += -w * w * dy - 2 * zeta * w * b.vy;
    }
    if (p.flow) {
      const m = p.flowScale ?? 1;
      const [ux0, uy0] = p.flow(b.x, b.y);
      const ux = ux0 * m,
        uy = uy0 * m;
      const g = p.flowGain ?? 1;
      fx += g * (ux - b.vx);
      fy += g * (uy - b.vy);
      if (p.spin) fa += p.spin * p.tilt.w * spinAt(p.flow, b.x, b.y);
    }
    if (p.lane) {
      const w2 = p.lane.w * p.lane.w;
      if (p.lane.kind === "y") {
        let dy = b.y - b.pref;
        if (p.torus) dy -= p.torus.H * Math.round(dy / p.torus.H);
        fy += -w2 * dy - p.lane.w * b.vy * 0.5;
      } else if (p.lane.ellipse) {
        const { A, B } = p.lane.ellipse;
        const r = Math.hypot(b.x / (A / B), b.y);
        if (r > 1) {
          // along the gradient of the elliptical radius
          const gx = b.x / ((A / B) * (A / B) * r),
            gy = b.y / r;
          const gl = Math.hypot(gx, gy);
          const k = (-w2 * (r - b.pref)) / gl;
          fx += (k * gx) / gl;
          fy += (k * gy) / gl;
        }
      }
    }
    if (p.wander) {
      // two slow sines a side, at periods and phases of the body's own
      const { force, period } = p.wander;
      const w = (2 * Math.PI) / period;
      const h1 = (i * 0.618034) % 1,
        h2 = (i * 0.414214) % 1;
      fx +=
        force *
        (Math.sin(w * (0.8 + 0.4 * h1) * t + 6.28 * h2) +
          0.5 * Math.sin(w * 1.7 * t + 6.28 * h1));
      fy +=
        force *
        (Math.sin(w * (0.8 + 0.4 * h2) * t + 6.28 * h1) +
          0.5 * Math.sin(w * 1.3 * t + 6.28 * h2));
    }
    if (p.speedLimit) {
      const m = p.flowScale ?? 1;
      const [ux, uy] = p.flow ? p.flow(b.x, b.y).map((u) => u * m) : [0, 0];
      const rx = b.vx - ux,
        ry = b.vy - uy;
      const sp = Math.hypot(rx, ry);
      if (sp > p.speedLimit) {
        const over = (4 * (sp - p.speedLimit)) / sp;
        fx -= rx * over;
        fy -= ry * over;
      }
    }
    const { w: tw, zeta: tz } = p.tilt;
    fa += -tw * tw * (b.a - b.homeA) - 2 * tz * tw * b.va;
    ax[i] = fx;
    ay[i] = fy;
    aa[i] = fa;
  }
  const k = p.push * p.push;
  reach(bodies, p.margin);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (far(i, j, p.torus)) continue;
      const A = bodies[i],
        B = bodies[j];
      const c = collide(A, B, p.margin, p.torus, contact);
      if (!c) continue;
      const mA = A.mass,
        mB = B.mass,
        mt = mA + mB;
      // a spring on the overlap, damped along the normal while closing
      const vn = (B.vx - A.vx) * c.nx + (B.vy - A.vy) * c.ny;
      let f = k * c.depth - (vn < 0 ? 2 * 0.7 * p.push * vn : 0);
      f = Math.max(0, f);
      // sideways: each slides off toward the side it's already on
      const tx = -c.ny,
        ty = c.nx;
      let rel = (B.x - A.x) * tx + (B.y - A.y) * ty;
      if (p.torus) {
        let dx = B.x - A.x,
          dy = B.y - A.y;
        dx -= p.torus.W * Math.round(dx / p.torus.W);
        dy -= p.torus.H * Math.round(dy / p.torus.H);
        rel = dx * tx + dy * ty;
      }
      const side = rel >= 0 ? 1 : -1;
      // B gets (mA/mt) of the push, A the rest, so the lighter one moves more
      ax[i] -= c.nx * f * (mB / mt);
      ay[i] -= c.ny * f * (mB / mt);
      ax[j] += c.nx * f * (mA / mt);
      ay[j] += c.ny * f * (mA / mt);
      if (p.slip) {
        // each eases toward sliding off to its own side at `slip`, no faster
        const gain = 2;
        const va = -side * (A.vx * tx + A.vy * ty),
          vb = side * (B.vx * tx + B.vy * ty);
        const sa = gain * Math.max(0, p.slip - va) * (mB / mt);
        const sb = gain * Math.max(0, p.slip - vb) * (mA / mt);
        ax[i] -= side * tx * sa;
        ay[i] -= side * ty * sa;
        ax[j] += side * tx * sb;
        ay[j] += side * ty * sb;
      }
      // turning: the push at the contact point, about each center, scaled
      // down a lot (tiles are videos, not boards, and shouldn't spin)
      const torque = (b: Body, sgn: number, share: number) => {
        let rx = c.px - b.x,
          ry = c.py - b.y;
        if (p.torus) {
          rx -= p.torus.W * Math.round(rx / p.torus.W);
          ry -= p.torus.H * Math.round(ry / p.torus.H);
        }
        const { w, h } = tileSize(b);
        const I = (w * w + h * h) / 12;
        return (sgn * share * (rx * c.ny - ry * c.nx) * f * 0.15) / I;
      };
      aa[i] += torque(A, -1, mB / mt);
      aa[j] += torque(B, 1, mA / mt);
    }
  }
  const max = p.tilt.max;
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    b.vx += ax[i] * dt;
    b.vy += ay[i] * dt;
    b.va += aa[i] * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.a += b.va * dt;
    // past the tilt limit, ease off rather than stop dead
    const off = b.a - b.homeA;
    if (Math.abs(off) > max) {
      b.a = b.homeA + Math.sign(off) * (max + (Math.abs(off) - max) * 0.5);
      b.va *= 0.5;
    }
  }
  // what drawing must never do: content over content
  reach(bodies, p.margin * 0.25);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (far(i, j, p.torus)) continue;
      const A = bodies[i],
        B = bodies[j];
      const c = collide(A, B, p.margin * 0.25, p.torus, contact);
      if (!c) continue;
      const wa = B.mass / (A.mass + B.mass);
      A.x -= c.nx * c.depth * wa;
      A.y -= c.ny * c.depth * wa;
      B.x += c.nx * c.depth * (1 - wa);
      B.y += c.ny * c.depth * (1 - wa);
      const vn = (B.vx - A.vx) * c.nx + (B.vy - A.vy) * c.ny;
      if (vn < 0) {
        A.vx += c.nx * vn * wa;
        A.vy += c.ny * vn * wa;
        B.vx -= c.nx * vn * (1 - wa);
        B.vy -= c.ny * vn * (1 - wa);
      }
    }
  }
  if (p.torus) for (const b of bodies) wrap(b, p.torus);
}
