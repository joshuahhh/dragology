// Builds the montage variants' layouts: nests the clips (nest.ts: on the
// repeating canvas, or in the vortex's ellipse), picks the camera's views,
// and lets the moving variants settle. Slow (seconds), so it runs ahead of time:
//
//   REPO=<checkout> node d2-talk/recorder/montage-variant-layouts.mjs
//
// writes variant-layouts.json, which the montage loads.

import type { Rect } from "../layout";
import { type Box, type ClipGeom, CLIPS } from "./clips";
import {
  ALL_OVERHANG,
  GAP,
  SIM,
  TAKE_TORUS,
  TAKES,
  TORUS,
  type VariantId,
  VORTEX_ELLIPSE,
} from "./motion";
import { nest } from "./nest";
import {
  type Body,
  makeBody,
  rng,
  step,
  tileSize,
  type Torus,
  updateBoxes,
} from "./physics";

/** A body as saved: its clip by id, and everything that moves */
export type BodyState = Pick<
  Body,
  "s" | "x" | "y" | "a" | "homeX" | "homeY" | "homeA" | "pref" | "phase" | "box"
> & { id: string };

export type VariantLayout = {
  bodies: BodyState[];
  /** Camera views: "start", "start-end" (where it drifts to), "all" */
  views: Record<string, Rect>;
};

/** The layouts, by variant; the pan variant pans over the packed one */
export type VariantLayouts = Record<Exclude<VariantId, "pan">, VariantLayout>;

/**
 * Each clip's size, as canvas units per video pixel up to an overall
 * scale: partly from its weight (its area follows it), partly from how
 * intricate it is (its edges per pixel, so fine detail shows bigger and big
 * bold shapes smaller), within a range so nothing's tiny or huge.
 */
export function clipScales(clips: ClipGeom[], detail = DETAIL): number[] {
  const logs = clips.map(
    (c) =>
      (1 - detail) * Math.log(Math.sqrt(c.weight / c.meanArea)) +
      detail * Math.log(Math.max(0.004, c.edges)),
  );
  const scales = logs.map(Math.exp);
  // keep areas within 3.5× of the median either way
  const areas = clips.map((c, i) => c.meanArea * scales[i] ** 2);
  const median = [...areas].sort((a, b) => a - b)[areas.length >> 1];
  return scales.map((s, i) => {
    const a = Math.min(median * 3.5, Math.max(median / 3.5, areas[i]));
    return s * Math.sqrt(a / areas[i]);
  });
}

/** How much of a clip's size comes from its intricacy, against its weight */
const DETAIL = 0.45;

/** A tile's bounding box on the canvas */
function aabb(b: Body) {
  const { w, h } = tileSize(b);
  const c = Math.abs(Math.cos(b.a)),
    s = Math.abs(Math.sin(b.a));
  const ex = (c * w + s * h) / 2,
    ey = (s * w + c * h) / 2;
  return { x0: b.x - ex, y0: b.y - ey, x1: b.x + ex, y1: b.y + ey };
}

/**
 * On the torus: the period-sized window cutting through the fewest tiles
 * (each cut tile counts its smaller side), so the pulled-back view shows
 * nearly every clip whole. Its top-left corner.
 */
function bestWindow(bodies: Body[], t: Torus): [number, number] {
  const mod = (v: number, m: number) => ((v % m) + m) % m;
  const cut = (lo: number, len: number, line: number, period: number) => {
    const rel = mod(lo - line, period);
    const over = rel + len - period;
    return over > 0 ? Math.min(over, len - over) : 0;
  };
  let best: [number, number] = [0, 0],
    bestCost = Infinity;
  const boxes = bodies.map(aabb);
  for (let ox = 0; ox < t.W; ox += 20) {
    for (let oy = 0; oy < t.H; oy += 20) {
      let cost = 0;
      for (const b of boxes) {
        const w = b.x1 - b.x0,
          h = b.y1 - b.y0;
        cost += cut(b.x0, w, ox, t.W) * h + cut(b.y0, h, oy, t.H) * w;
      }
      if (cost < bestCost) [bestCost, best] = [cost, [ox, oy]];
    }
  }
  return best;
}

/**
 * The 1920×1080 view inside `within` that shows the most clip weight
 * whole, preferring the middle.
 */
function bestStart(bodies: Body[], within: Rect, torus: Torus | null): Rect {
  const W = 1920,
    H = 1080;
  const boxes = bodies.flatMap((b) => {
    const a = aabb(b);
    if (!torus) return [{ ...a, wt: b.clip.weight }];
    // copies a period away count too
    return [-1, 0, 1].flatMap((i) =>
      [-1, 0, 1].map((j) => ({
        x0: a.x0 + i * torus.W,
        x1: a.x1 + i * torus.W,
        y0: a.y0 + j * torus.H,
        y1: a.y1 + j * torus.H,
        wt: b.clip.weight,
      })),
    );
  });
  const mx = within.x + within.w / 2,
    my = within.y + within.h / 2;
  let best = { x: mx - W / 2, y: my - H / 2, w: W, h: H },
    bestScore = -Infinity;
  for (let x = within.x; x + W <= within.x + within.w; x += 20) {
    for (let y = within.y; y + H <= within.y + within.h; y += 20) {
      let score = 0;
      for (const b of boxes) {
        if (b.x0 >= x && b.x1 <= x + W && b.y0 >= y && b.y1 <= y + H)
          score += b.wt;
      }
      score -= Math.hypot(x + W / 2 - mx, y + H / 2 - my) / 1500;
      if (score > bestScore) [bestScore, best] = [score, { x, y, w: W, h: H }];
    }
  }
  return best;
}

/** Where the opening view drifts to: as the grid montage does it */
function startEnd(s: Rect, dx = 420, dy = 160, grow = 1.12): Rect {
  const w = s.w * grow,
    h = s.h * grow;
  return { x: s.x + s.w / 2 + dx - w / 2, y: s.y + s.h / 2 + dy - h / 2, w, h };
}

function torusViews(bodies: Body[], seamed = false): Record<string, Rect> {
  const [ox, oy] = seamed ? [0, 0] : bestWindow(bodies, TORUS);
  const all = {
    x: ox - (TORUS.W * (ALL_OVERHANG - 1)) / 2,
    y: oy - (TORUS.H * (ALL_OVERHANG - 1)) / 2,
    w: TORUS.W * ALL_OVERHANG,
    h: TORUS.H * ALL_OVERHANG,
  };
  const start = bestStart(
    bodies,
    { x: ox, y: oy, w: TORUS.W, h: TORUS.H },
    TORUS,
  );
  return { start, "start-end": startEnd(start), all };
}

/**
 * Views for a take (motion.ts's TAKES): it opens just ahead of the first
 * arrangement's spotlit clips (nest.ts put them in its middle), so that,
 * streaming across the screen, they come through the middle about LEAD
 * seconds in. "all", what it pulls back to, is a little less than the
 * canvas is high, so nothing shows twice.
 */
function takeViews(id: VariantId, bodies: Body[]): Record<string, Rect> {
  const LEAD = 2.5;
  const [sx, sy] = TAKES[id]?.stream ?? [0, 0];
  const T = TAKE_TORUS;
  // where the first arrangement's spotlit clips are, averaged round the torus
  const lit = bodies.filter(
    (b, i) => i < CLIPS.length && (b.clip.spotlight ?? 1) >= 2.5,
  );
  const around = (v: (b: Body) => number, period: number) => {
    let c = 0,
      s = 0;
    for (const b of lit) {
      const a = (2 * Math.PI * v(b)) / period;
      c += Math.cos(a) * b.mass;
      s += Math.sin(a) * b.mass;
    }
    return ((Math.atan2(s, c) / (2 * Math.PI)) * period + period) % period;
  };
  const cx = around((b) => b.x, T.W) + sx * LEAD,
    cy = around((b) => b.y, T.H) + sy * LEAD;
  const start = { x: cx - 960, y: cy - 540, w: 1920, h: 1080 };
  const h = T.H * 0.97,
    w = (h * 16) / 9;
  const all = { x: cx - w / 2, y: cy - h / 2, w, h };
  return { start, "start-end": startEnd(start), all };
}

/** Run a moving variant for a while from rest, so it starts settled */
function settle(id: VariantId, bodies: Body[], seconds: number) {
  const sim = SIM[id];
  if (!sim) return;
  const dt = 1 / 120;
  // the clock runs up to 0, where the clips start
  for (let t = -seconds; t < 0; t += dt) {
    updateBoxes(bodies, t, sim);
    step(bodies, t, dt, sim);
  }
}

const r2 = (x: number) => Math.round(x * 100) / 100;

function save(bodies: Body[], views: Record<string, Rect>): VariantLayout {
  return {
    bodies: bodies.map((b) => ({
      id: b.clip.id,
      s: Math.round(b.s * 1e5) / 1e5,
      x: r2(b.x),
      y: r2(b.y),
      a: Math.round(b.a * 1e5) / 1e5,
      homeX: r2(b.homeX),
      homeY: r2(b.homeY),
      homeA: Math.round(b.homeA * 1e5) / 1e5,
      pref: r2(b.pref),
      phase: Math.round(b.phase * 1000) / 1000,
      box: b.box.map(r2) as Box,
    })),
    views: Object.fromEntries(
      Object.entries(views).map(([k, r]) => [
        k,
        { x: r2(r.x), y: r2(r.y), w: r2(r.w), h: r2(r.h) },
      ]),
    ),
  };
}

/** Build the layouts (or just those named in `only`) */
export function buildLayouts(
  log = console.log,
  only?: string[],
): Partial<VariantLayouts> {
  const time = (name: string, f: () => VariantLayout): VariantLayout => {
    const t0 = performance.now();
    const v = f();
    // how much of the canvas the clips' boxes cover
    const area = v.bodies.reduce((sum, b) => {
      const [x0, y0, x1, y1] = b.box;
      return sum + (x1 - x0) * (y1 - y0) * b.s * b.s;
    }, 0);
    const of =
      name === "vortex"
        ? Math.PI * VORTEX_ELLIPSE.A * VORTEX_ELLIPSE.B
        : name in TAKES
          ? TAKE_TORUS.W * TAKE_TORUS.H
          : TORUS.W * TORUS.H;
    log(
      `${name}: ${((performance.now() - t0) / 1000).toFixed(1)} s, ` +
        `boxes cover ${Math.round((100 * area) / of)}%`,
    );
    return v;
  };
  const want = (name: string) => !only || only.includes(name);
  /**
   * Nest the clips (by what each draws most of the time, if `typical`),
   * then shrink each by `slack` about its center, for room to move
   */
  const nestBodies = (o: {
    seed: number;
    typical: boolean;
    slack: number;
    W: number;
    H: number;
    seam: number;
    growMax: number;
    wall?: (x: number, y: number) => boolean;
    /** Put the clips most worth the opening view in the middle */
    spotlight?: boolean;
    /**
     * Every clip this many times, each set arranged apart in its own
     * stretch of the canvas, side by side across it
     */
    copies?: number;
  }) => {
    const copies = o.copies ?? 1;
    const clips = Array.from({ length: copies }, () => CLIPS).flat();
    const scales = clipScales(CLIPS);
    const placed = nest(
      clips.map((clip, i) => {
        const k = Math.floor(i / CLIPS.length);
        return {
          clip,
          s: scales[i % CLIPS.length],
          box: o.typical ? clip.typical : undefined,
          priority: o.spotlight ? clip.spotlight : 1,
          region:
            copies > 1
              ? ([(k * o.W) / copies, ((k + 1) * o.W) / copies] as [
                  number,
                  number,
                ])
              : undefined,
          // copies well apart, so few pairs can be on screen together
          apart: copies > 1 ? (0.7 * o.W) / copies : undefined,
        };
      }),
      {
        W: o.W,
        H: o.H,
        cell: 10,
        gap: GAP,
        seam: o.seam,
        growMax: o.growMax,
        tilt: 2,
        seed: o.seed,
        tries: 3,
        wall: o.wall,
        log,
      },
    );
    const r = rng(o.seed);
    return clips.map((clip, i) => {
      const b = makeBody(
        clip,
        placed[i].s * (1 - o.slack),
        r() * clip.duration,
      );
      b.box = [...(o.typical ? clip.typical : clip.union)] as Box;
      Object.assign(b, { x: placed[i].x, y: placed[i].y, a: placed[i].a });
      Object.assign(b, { homeX: b.x, homeY: b.y, homeA: b.a });
      const { w, h } = tileSize(b);
      b.mass = w * h;
      return b;
    });
  };
  /** A take's canvas: two arrangements of every clip, side by side */
  const takeBodies = (
    seed: number,
    typical: boolean,
    slack: number,
    growMax: number,
  ) =>
    nestBodies({
      seed,
      typical,
      slack,
      W: TAKE_TORUS.W,
      H: TAKE_TORUS.H,
      seam: 0.5,
      growMax,
      spotlight: true,
      copies: 2,
    });
  return {
    "flow-pan": !want("flow-pan")
      ? undefined
      : time("flow-pan", () => {
          const bodies = takeBodies(19, true, 0.08, 1.15);
          for (const b of bodies) b.pref = b.y;
          settle("flow-pan", bodies, 4);
          return save(bodies, takeViews("flow-pan", bodies));
        }),
    "jostle-pan": !want("jostle-pan")
      ? undefined
      : time("jostle-pan", () => {
          const bodies = takeBodies(17, true, 0.04, 1.2);
          settle("jostle-pan", bodies, 4);
          return save(bodies, takeViews("jostle-pan", bodies));
        }),
    "still-pan": !want("still-pan")
      ? undefined
      : time("still-pan", () => {
          const bodies = takeBodies(23, false, 0, 1.3);
          return save(bodies, takeViews("still-pan", bodies));
        }),
    packed: !want("packed")
      ? undefined
      : time("packed", () => {
          const bodies = nestBodies({
            seed: 7,
            typical: false,
            slack: 0,
            W: TORUS.W,
            H: TORUS.H,
            seam: 0.18,
            growMax: 1.3,
          });
          return save(bodies, torusViews(bodies, true));
        }),
    jostle: !want("jostle")
      ? undefined
      : time("jostle", () => {
          const bodies = nestBodies({
            seed: 11,
            typical: true,
            slack: 0.04,
            W: TORUS.W,
            H: TORUS.H,
            seam: 0.18,
            growMax: 1.2,
          });
          settle("jostle", bodies, 4);
          return save(bodies, torusViews(bodies, true));
        }),
    drift: !want("drift")
      ? undefined
      : time("drift", () => {
          const bodies = nestBodies({
            seed: 5,
            typical: true,
            slack: 0.08,
            W: TORUS.W,
            H: TORUS.H,
            seam: 0.5,
            growMax: 1.15,
          });
          for (const b of bodies) b.pref = b.y;
          settle("drift", bodies, 4);
          return save(bodies, torusViews(bodies));
        }),
    vortex: !want("vortex")
      ? undefined
      : time("vortex", () => {
          const e = VORTEX_ELLIPSE;
          // a board with room round the ellipse, walled off outside it
          const W = 2 * e.A + 400,
            H = 2 * e.B + 400;
          const bodies = nestBodies({
            seed: 3,
            typical: true,
            slack: 0.07,
            W,
            H,
            seam: 0.5,
            growMax: 1.15,
            wall: (x, y) =>
              Math.hypot((x - W / 2) / e.A, (y - H / 2) / e.B) > 1,
          });
          for (const b of bodies) {
            b.x -= W / 2;
            b.y -= H / 2;
            b.homeX = b.x;
            b.homeY = b.y;
            b.pref = Math.hypot(b.x / (e.A / e.B), b.y);
          }
          settle("vortex", bodies, 4);
          const all = {
            x: -e.A * 1.04,
            y: -e.B * 1.04,
            w: 2 * e.A * 1.04,
            h: 2 * e.B * 1.04,
          };
          const start = { x: -960, y: -540, w: 1920, h: 1080 };
          return save(bodies, {
            start,
            "start-end": startEnd(start, 0, 0, 1.25),
            all,
          });
        }),
  };
}
