// The clips the montage variants draw, and where in each video its content
// is, frame by frame (clip-bounds.json, measured by
// d2-talk/recorder/montage-bounds.mjs). The variants pack and push clips by
// what they draw rather than by their video rects, and drop the cards, so
// clips sit directly on the canvas.

import boundsJson from "./clip-bounds.json";
import shapesJson from "./clip-shapes.json";

type BoundsEntry = {
  w: number;
  h: number;
  duration: number;
  union: number[];
  /** "x0 y0 x1 y1" per sample, comma-separated, in video pixels */
  boxes: string;
};
const bounds = boundsJson as {
  fps: number;
  clips: Record<string, BoundsEntry>;
};

type ShapeEntry = {
  mw: number;
  mh: number;
  stroke: number;
  edges: number;
  /** Rows of hex, a bit a cell, separated by spaces */
  mask: string;
};
/** Measured by d2-talk/recorder/montage-shapes.mjs */
const shapes = shapesJson as unknown as { clips: Record<string, ShapeEntry> };

const E = "educators",
  G = "game-designers",
  M = "mathematicians",
  C = "creative-tools";

export type ClipSpec = {
  id: string;
  /** A video in public/slides */
  file: string;
  /** Roughly, its share of the canvas: area scales with it */
  weight: number;
  groups: string[];
  /** The demo it shows; clips of one demo are kept apart */
  demo: string;
  /** Not in the grid montage: another take, added for variety */
  extra?: boolean;
  /** How much it deserves the opening view (see SPOTLIGHT) */
  spotlight?: number;
};

const old = (id: string, weight: number, groups: string[]): ClipSpec => ({
  id,
  file: `closing-montage/${id}.mp4`,
  weight,
  groups,
  demo: id,
});
const rec = (
  id: string,
  weight: number,
  groups: string[],
  demo = id,
  file = `canvas-clips/${id}.mp4`,
): ClipSpec => ({ id, file, weight, groups, demo });
/** Another take of a demo, from the Declarative Dragging slide's reel */
const awe = (
  name: string,
  weight: number,
  groups: string[],
  demo = name,
): ClipSpec => ({
  id: `${name}-reel`,
  file: `awe/${name}.mp4`,
  weight,
  groups,
  demo,
  extra: true,
});

/**
 * The grid montage's clips (d2-talk/recorder/canvas-layout.mjs), with the
 * layout editor filmed alone, then other takes of some of the same demos.
 */
export const CLIP_SPECS: ClipSpec[] = [
  rec("catalan-explorer", 2.6, [M, E]),
  old("dragon", 1.0, [M]),
  rec("robot-arm", 2.2, [G, E]),
  old("sokoban", 0.6, [G]),
  rec("lambda-beta", 1.3, [E, M]),
  rec("plane-partition", 1.6, [M, E]),
  old("hanoi", 0.8, [G, E]),
  rec(
    "layout-editor",
    1.8,
    [C],
    "layout-editor",
    "canvas-clips/layout-editor-solo.mp4",
  ),
  old("tromino", 0.6, [G, M]),
  rec("graph-bulge", 1.1, [M, E]),
  old("face", 0.55, [C, E]),
  rec("gears", 1.4, [C, G, E]),
  old("tactile-tessellations", 1.1, [M, E]),
  rec("braid-word", 1.1, [M]),
  rec("git-graph-surgery", 1.1, [C]),
  old("order-preserving", 0.7, [M]),
  rec("pivot-table", 2.0, [C, E]),
  rec("knot", 1.0, [M]),
  old("scene-3d", 1.0, [G, C]),
  rec("aztec-diamond", 1.5, [M]),
  old("nool-tree", 0.8, [E, M]),
  rec("permutation-lab-talk", 2.8, [M, E], "permutation-lab"),
  old("outline", 0.45, [C, E]),
  rec("frobenius-tangle", 1.0, [M]),
  old("interval-graph", 0.9, [M, C]),
  rec("gantt", 1.1, [C, E]),
  rec("rotations-rebalancing", 1.0, [E]),
  old("bezier", 0.7, [C]),
  rec("regex-nfa-sync", 1.3, [E, M]),
  old("two-kinds-of-tree", 0.65, [C]),
  rec("frobenius-algebra", 0.8, [M]),
  old("chain-of-links", 0.9, [G]),
  rec("stock-and-flow", 0.9, [E, C]),
  rec("zx-string-diagram", 0.8, [M]),
  old("fifteen", 0.55, [G]),
  rec("animate-algebra-stage-builder", 0.9, [E, M]),
  old("lists-of-lists", 0.85, [C]),
  rec("rush-hour", 0.8, [G]),
  rec("tableaux", 0.8, [M, E]),
  old("multi-circle-points", 0.7, [E]),
  rec("graspable-math", 0.6, [E, M]),
  old("timeline", 0.75, [C]),
  rec("proof-by-dragging", 0.6, [E, M]),
  old("nodes-and-noodles", 0.65, [C]),
  rec("ring-of-beads", 0.6, [C, E]),
  old("sprouting-tree", 0.7, [C, M]),
  rec("lock-past", 0.55, [G, C]),
  old("magnet", 0.55, [G, C]),
  old("grid-poly", 0.35, [E, M]),
  old("braid", 0.45, [M]),
  rec("snap-to-islands", 0.45, [G]),

  awe("spec-workshop", 1.2, [C, E]),
  awe("permutation-lab", 1.2, [M, E]),
  awe("braid", 1.0, [M], "braid-word"),
  awe("rotations-splay", 0.9, [E], "rotations-rebalancing"),
  awe("pivot-table", 1.0, [C, E]),
  awe("proof-by-dragging", 0.8, [E, M]),
  awe("catalan-explorer", 1.2, [M, E]),
  awe("gantt", 0.9, [C, E]),
  awe("lambda-beta", 0.9, [E, M]),
  awe("regex-nfa-sync", 1.0, [E, M]),
];

/**
 * How much each clip deserves the opening view, where the camera starts
 * (default 1): the best of the demos the talk doesn't otherwise show come
 * first; those it shows on slides of their own, and the plainest, go
 * further out.
 */
const SPOTLIGHT: Record<string, number> = {
  "lambda-beta": 3,
  gears: 3,
  "robot-arm": 3,
  "catalan-explorer": 3,
  "plane-partition": 3,
  "aztec-diamond": 3,
  knot: 2.5,
  "rush-hour": 2.5,
  "regex-nfa-sync": 2.5,
  "git-graph-surgery": 2.5,
  "braid-word": 2.5,
  "stock-and-flow": 2.5,
  tromino: 2,
  fifteen: 2,
  sokoban: 2,
  tableaux: 2,
  "frobenius-tangle": 2,
  "pivot-table": 2,
  "layout-editor": 2,
  gantt: 2,
  // on slides of their own
  "interval-graph": 0.5,
  "lists-of-lists": 0.5,
  "tactile-tessellations": 0.5,
  "order-preserving": 0.5,
  "two-kinds-of-tree": 0.5,
  "nool-tree": 0.5,
  "animate-algebra-stage-builder": 0.5,
  "permutation-lab-talk": 0.5,
  "permutation-lab-reel": 0.5,
  "spec-workshop-reel": 0.5,
  // plain
  "grid-poly": 0.2,
  "chain-of-links": 0.4,
  magnet: 0.4,
  "sprouting-tree": 0.4,
  "snap-to-islands": 0.4,
  "lock-past": 0.4,
  "multi-circle-points": 0.4,
};
for (const c of CLIP_SPECS) c.spotlight = SPOTLIGHT[c.id] ?? 1;

/** Where a clip draws, in video pixels: x0, y0, x1, y1 */
export type Box = [number, number, number, number];

export type ClipGeom = ClipSpec & {
  /** The video's size, in pixels */
  w: number;
  h: number;
  duration: number;
  /** Everything the clip ever draws */
  union: Box;
  /** Its content's mean area over the clip, in video pixels */
  meanArea: number;
  /** A box the content fits most of the time (each side's 75th percentile) */
  typical: Box;
  fps: number;
  /** x0 y0 x1 y1 per sample */
  boxes: Float32Array;
  /**
   * Where it ever draws: a mw×mh grid of cells over its union box, row by
   * row, 1 where drawn
   */
  mask: { mw: number; mh: number; cells: Uint8Array };
  /** The fraction of its union box that's edges: how intricate it is */
  edges: number;
  /** A few boxes covering its mask, in video pixels: its shape, for colliding */
  parts: Box[];
};

function parseMask(sh: ShapeEntry): ClipGeom["mask"] {
  const cells = new Uint8Array(sh.mw * sh.mh);
  sh.mask.split(" ").forEach((row, y) => {
    for (let x = 0; x < sh.mw; x++) {
      const digit = parseInt(row[x >> 2], 16);
      cells[y * sh.mw + x] = (digit >> (3 - (x & 3))) & 1;
    }
  });
  return { mw: sh.mw, mh: sh.mh, cells };
}

/**
 * A few boxes that between them cover every drawn cell of a mask: its
 * bounding box, or, if that's mostly empty, split at its emptiest row or
 * column and each side covered the same way (to `depth` splits).
 */
function maskParts(mask: ClipGeom["mask"], union: Box, depth = 3): Box[] {
  const { mw, mh, cells } = mask;
  const on = (x: number, y: number) => cells[y * mw + x] === 1;
  const parts: Box[] = [];
  const cover = (x0: number, y0: number, x1: number, y1: number, d: number) => {
    // shrink to what's drawn
    let a = x1,
      b = y1,
      c = x0,
      e = y0,
      n = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        if (on(x, y)) {
          a = Math.min(a, x);
          b = Math.min(b, y);
          c = Math.max(c, x + 1);
          e = Math.max(e, y + 1);
          n++;
        }
    if (!n) return;
    [x0, y0, x1, y1] = [a, b, c, e];
    const fill = n / ((x1 - x0) * (y1 - y0));
    if (d === 0 || fill > 0.8 || (x1 - x0 < 4 && y1 - y0 < 4)) {
      const [ux0, uy0, ux1, uy1] = union;
      const sx = (ux1 - ux0) / mw,
        sy = (uy1 - uy0) / mh;
      parts.push([ux0 + x0 * sx, uy0 + y0 * sy, ux0 + x1 * sx, uy0 + y1 * sy]);
      return;
    }
    // the emptiest line across the longer way, away from the ends
    const vertical = x1 - x0 >= y1 - y0;
    const [lo, hi] = vertical ? [x0, x1] : [y0, y1];
    let cut = Math.floor((lo + hi) / 2),
      least = Infinity;
    for (
      let k = lo + Math.ceil((hi - lo) / 5);
      k < hi - Math.ceil((hi - lo) / 5);
      k++
    ) {
      let m = 0;
      if (vertical) for (let y = y0; y < y1; y++) m += cells[y * mw + k];
      else for (let x = x0; x < x1; x++) m += cells[k * mw + x];
      if (m < least) [least, cut] = [m, k];
    }
    if (vertical) {
      cover(x0, y0, cut, y1, d - 1);
      cover(cut, y0, x1, y1, d - 1);
    } else {
      cover(x0, y0, x1, cut, d - 1);
      cover(x0, cut, x1, y1, d - 1);
    }
  };
  cover(0, 0, mw, mh, depth);
  return parts;
}

function geom(spec: ClipSpec): ClipGeom | null {
  const b = bounds.clips[spec.file];
  const sh = shapes.clips[spec.file];
  if (!b || !sh) return null;
  const nums = b.boxes.split(/[ ,]/).map(Number);
  const boxes = new Float32Array(nums);
  const n = boxes.length / 4;
  let meanArea = 0;
  const sides: number[][] = [[], [], [], []];
  for (let i = 0; i < n; i++) {
    const [x0, y0, x1, y1] = boxes.subarray(4 * i, 4 * i + 4);
    meanArea += ((x1 - x0) * (y1 - y0)) / n;
    sides[0].push(x0);
    sides[1].push(y0);
    sides[2].push(x1);
    sides[3].push(y1);
  }
  const q = (xs: number[], f: number) =>
    [...xs].sort((a, b) => a - b)[
      Math.min(xs.length - 1, Math.floor(f * xs.length))
    ];
  const typical: Box = [
    q(sides[0], 0.25),
    q(sides[1], 0.25),
    q(sides[2], 0.75),
    q(sides[3], 0.75),
  ];
  const mask = parseMask(sh);
  return {
    ...spec,
    w: b.w,
    h: b.h,
    duration: b.duration,
    union: b.union as Box,
    meanArea,
    typical,
    fps: bounds.fps,
    boxes,
    mask,
    edges: sh.edges,
    parts: maskParts(mask, b.union as Box),
  };
}

export const CLIPS: ClipGeom[] = CLIP_SPECS.map(geom).filter(
  (c): c is ClipGeom => c !== null,
);

/**
 * The union of a clip's content boxes over clip time [t0, t1] (seconds,
 * wrapping around the loop), in video pixels.
 */
export function boxOver(c: ClipGeom, t0: number, t1: number, out: Box): Box {
  const n = c.boxes.length / 4;
  const i0 = Math.floor(t0 * c.fps);
  const i1 = Math.max(i0, Math.floor(t1 * c.fps));
  out[0] = out[1] = Infinity;
  out[2] = out[3] = -Infinity;
  for (let i = i0; i <= i1; i++) {
    const k = 4 * (((i % n) + n) % n);
    out[0] = Math.min(out[0], c.boxes[k]);
    out[1] = Math.min(out[1], c.boxes[k + 1]);
    out[2] = Math.max(out[2], c.boxes[k + 2]);
    out[3] = Math.max(out[3], c.boxes[k + 3]);
  }
  return out;
}

/**
 * A box around a clip's content at clip time t whose sides never move faster
 * than `ramp` (video pixels per second): each side is as far out as the
 * content gets within `reach` seconds either way, less `ramp` times how far
 * off that is. So the box always holds the content, opens up ahead of
 * content that's coming (just in time), closes in behind content that's
 * gone, and moves continuously throughout.
 */
export function rampedBox(
  c: ClipGeom,
  t: number,
  ramp: number,
  reach: number,
  out: Box,
): Box {
  const n = c.boxes.length / 4;
  const i0 = Math.floor((t - reach) * c.fps);
  const i1 = Math.floor((t + reach) * c.fps);
  out[0] = out[1] = Infinity;
  out[2] = out[3] = -Infinity;
  for (let i = i0; i <= i1; i++) {
    // how far t is from this sample's stretch of time
    const a = i / c.fps,
      b = (i + 1) / c.fps;
    const off = t < a ? a - t : t > b ? t - b : 0;
    const give = ramp * off;
    const k = 4 * (((i % n) + n) % n);
    out[0] = Math.min(out[0], c.boxes[k] + give);
    out[1] = Math.min(out[1], c.boxes[k + 1] + give);
    out[2] = Math.max(out[2], c.boxes[k + 2] - give);
    out[3] = Math.max(out[3], c.boxes[k + 3] - give);
  }
  return out;
}
