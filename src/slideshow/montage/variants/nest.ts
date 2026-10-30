// Nesting: packs clips by their shapes (where each ever draws, clips.ts's
// `mask`), not their boxes, so a small clip can sit in the empty corner of a
// big one. The canvas is a grid of cells, repeating (a torus); each clip is
// rasterized at its size and angle, and placed one by one where it fits
// (keeping `gap` from everything drawn) and touches the most of what's
// already there, so each settles into a notch rather than out in the open.
// The sizes are all scaled together, as large as still lets every clip
// find a place, then each clip grows into whatever room it has left.

import type { Box, ClipGeom } from "./clips";
import { rng } from "./physics";

export type NestItem = {
  clip: ClipGeom;
  /** Its size, relative to the others: canvas units per video pixel at scale 1 */
  s: number;
  /** Pack only the part of its mask in this box (video pixels) */
  box?: Box;
  /**
   * How early to place it (default 1): the first goes in the middle, and
   * the rest grow out from there, so a higher priority sits nearer it
   */
  priority?: number;
  /**
   * Keep its center within these x (canvas units). Each region grows from
   * its own middle, so items in different regions are arranged apart (and
   * meet, interlocking, where the regions do).
   */
  region?: [number, number];
  /**
   * Keep its center at least this far (canvas units) from other items of
   * the same clip, so copies don't sit side by side
   */
  apart?: number;
};

export type Placed = {
  /** The clip's union box's center, in canvas units */
  x: number;
  y: number;
  /** Canvas units per video pixel */
  s: number;
  /** Radians */
  a: number;
};

export type NestOpts = {
  W: number;
  H: number;
  /** Cell size, canvas units */
  cell: number;
  /** Least space between clips' drawings, canvas units */
  gap: number;
  /**
   * How much of a clip may reach across the period's edges (x = 0, y = 0);
   * a half or more for no limit
   */
  seam: number;
  /** Cells (by their centers, canvas units) no clip may draw in */
  wall?: (x: number, y: number) => boolean;
  /** How much bigger than its share a clip may grow into spare room */
  growMax: number;
  /** The largest tilt to try, degrees */
  tilt: number;
  seed: number;
  /** Orderings tried at each overall size */
  tries: number;
  log?: (s: string) => void;
};

/** A clip rasterized at a size and angle: its drawing, and the zones round it */
type Raster = {
  w: number;
  h: number;
  /** Cells it draws in */
  ink: Uint8Array;
  /** Rows of bits, at each of 32 shifts: where nothing else may be drawn */
  keepOut: Uint32Array[];
  /** And the ring just outside that, where touching counts */
  ring: Uint32Array[];
  /** Words a row */
  nw: number;
  ringCells: number;
  /** The drawing's extent within the raster, cells */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

const RING = 2;

function rasterize(
  clip: ClipGeom,
  s: number,
  a: number,
  cell: number,
  gapCells: number,
  only?: Box,
): Raster {
  const [ux0, uy0, ux1, uy1] = clip.union;
  const UW = (ux1 - ux0) * s,
    UH = (uy1 - uy0) * s;
  const c = Math.cos(a),
    sn = Math.sin(a);
  const ex = (Math.abs(c) * UW + Math.abs(sn) * UH) / 2,
    ey = (Math.abs(sn) * UW + Math.abs(c) * UH) / 2;
  const M = gapCells + RING + 1;
  const w = 2 * (Math.ceil(ex / cell) + M),
    h = 2 * (Math.ceil(ey / cell) + M);
  const cx = w / 2,
    cy = h / 2;
  const ink = new Uint8Array(w * h);
  const { mw, mh, cells } = clip.mask;
  let x0 = w,
    y0 = h,
    x1 = 0,
    y1 = 0;
  for (let my = 0; my < mh; my++) {
    for (let mx = 0; mx < mw; mx++) {
      if (!cells[my * mw + mx]) continue;
      if (only) {
        // the cell's center, in video pixels
        const vx = ux0 + ((mx + 0.5) / mw) * (ux1 - ux0),
          vy = uy0 + ((my + 0.5) / mh) * (uy1 - uy0);
        if (vx < only[0] || vx > only[2] || vy < only[1] || vy > only[3])
          continue;
      }
      // the mask cell's corners, turned, in raster cells
      let lo = Infinity,
        hi = -Infinity,
        lo2 = Infinity,
        hi2 = -Infinity;
      for (const [fx, fy] of [
        [mx, my],
        [mx + 1, my],
        [mx, my + 1],
        [mx + 1, my + 1],
      ]) {
        const lx = (fx / mw - 0.5) * UW,
          ly = (fy / mh - 0.5) * UH;
        const X = cx + (c * lx - sn * ly) / cell,
          Y = cy + (sn * lx + c * ly) / cell;
        lo = Math.min(lo, X);
        hi = Math.max(hi, X);
        lo2 = Math.min(lo2, Y);
        hi2 = Math.max(hi2, Y);
      }
      for (let y = Math.floor(lo2); y < Math.ceil(hi2); y++) {
        for (let x = Math.floor(lo); x < Math.ceil(hi); x++) {
          ink[y * w + x] = 1;
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x + 1);
          y1 = Math.max(y1, y + 1);
        }
      }
    }
  }
  const dilate = (src: Uint8Array, r: number) => {
    const out = new Uint8Array(w * h);
    const offs: [number, number][] = [];
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++)
        if (dx * dx + dy * dy <= r * r + 0.01) offs.push([dx, dy]);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!src[y * w + x]) continue;
        for (const [dx, dy] of offs) {
          const X = x + dx,
            Y = y + dy;
          if (X >= 0 && X < w && Y >= 0 && Y < h) out[Y * w + X] = 1;
        }
      }
    return out;
  };
  const keep = dilate(ink, gapCells);
  const outer = dilate(ink, gapCells + RING);
  const ringCells = outer.reduce((n, v, i) => n + (v && !keep[i] ? 1 : 0), 0);
  const nw = Math.ceil((w + 31) / 32);
  const shifted = (on: (i: number) => boolean) =>
    Array.from({ length: 32 }, (_, sft) => {
      const rows = new Uint32Array(h * nw);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if (on(y * w + x)) {
            const b = sft + x;
            rows[y * nw + (b >> 5)] |= 1 << (b & 31);
          }
      return rows;
    });
  return {
    w,
    h,
    ink,
    keepOut: shifted((i) => keep[i] === 1),
    ring: shifted((i) => outer[i] === 1 && keep[i] === 0),
    nw,
    ringCells,
    x0,
    y0,
    x1,
    y1,
  };
}

function popcount(v: number) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** The canvas: which cells are drawn in, as rows of bits, wrapping both ways */
class Board {
  readonly NW: number;
  readonly NH: number;
  /** Bits past NW repeat the start of the row, so a test can run off the end */
  readonly ext: number;
  readonly WR: number;
  readonly bits: Uint32Array;
  /** Cells nothing may be drawn in, laid out as `bits` */
  readonly wall: Uint32Array;
  /** Drawn cells per block of BLOCK×BLOCK, summed (wrapping) for quick "anything near?" */
  static readonly BLOCK = 4;
  readonly BW: number;
  readonly BH: number;
  readonly blocks: Uint16Array;
  sums: Int32Array;

  constructor(NW: number, NH: number, ext: number) {
    this.NW = NW;
    this.NH = NH;
    this.ext = ext;
    this.WR = Math.ceil((NW + ext) / 32) + 2;
    this.bits = new Uint32Array(this.WR * NH);
    this.wall = new Uint32Array(this.WR * NH);
    this.BW = Math.ceil(NW / Board.BLOCK);
    this.BH = Math.ceil(NH / Board.BLOCK);
    this.blocks = new Uint16Array(this.BW * this.BH);
    this.sums = new Int32Array((2 * this.BW + 1) * (2 * this.BH + 1));
  }

  /** Wall off a cell */
  block(x: number, y: number) {
    const r = y * this.WR;
    this.wall[r + (x >> 5)] |= 1 << (x & 31);
    if (x < this.ext) {
      const X = x + this.NW;
      this.wall[r + (X >> 5)] |= 1 << (X & 31);
    }
  }

  set(x: number, y: number) {
    x = ((x % this.NW) + this.NW) % this.NW;
    y = ((y % this.NH) + this.NH) % this.NH;
    const r = y * this.WR;
    this.bits[r + (x >> 5)] |= 1 << (x & 31);
    if (x < this.ext) {
      const X = x + this.NW;
      this.bits[r + (X >> 5)] |= 1 << (X & 31);
    }
    this.blocks[
      Math.floor(y / Board.BLOCK) * this.BW + Math.floor(x / Board.BLOCK)
    ]++;
  }

  clear(x: number, y: number) {
    x = ((x % this.NW) + this.NW) % this.NW;
    y = ((y % this.NH) + this.NH) % this.NH;
    const r = y * this.WR;
    this.bits[r + (x >> 5)] &= ~(1 << (x & 31));
    if (x < this.ext) {
      const X = x + this.NW;
      this.bits[r + (X >> 5)] &= ~(1 << (X & 31));
    }
    this.blocks[
      Math.floor(y / Board.BLOCK) * this.BW + Math.floor(x / Board.BLOCK)
    ]--;
  }

  /** Recount the block sums, over the canvas tiled 2×2 so ranges can wrap */
  resum() {
    const { BW, BH } = this;
    const SW = 2 * BW + 1;
    for (let y = 0; y < 2 * BH; y++) {
      let row = 0;
      for (let x = 0; x < 2 * BW; x++) {
        row += this.blocks[(y % BH) * BW + (x % BW)] ? 1 : 0;
        this.sums[(y + 1) * SW + x + 1] = this.sums[y * SW + x + 1] + row;
      }
    }
  }

  /** Whether anything's drawn in cells [x0, x1) × [y0, y1), roughly (by block) */
  anyNear(x0: number, y0: number, x1: number, y1: number) {
    const B = Board.BLOCK;
    const { BW, BH } = this;
    const bx0 = Math.floor(x0 / B),
      by0 = Math.floor(y0 / B);
    const bx1 = Math.min(bx0 + BW, Math.ceil(x1 / B)),
      by1 = Math.min(by0 + BH, Math.ceil(y1 / B));
    const SW = 2 * BW + 1;
    const s = this.sums;
    return (
      s[by1 * SW + bx1] -
        s[by0 * SW + bx1] -
        s[by1 * SW + bx0] +
        s[by0 * SW + bx0] >
      0
    );
  }

  /** Whether a raster's keep-out zone at (p, q) (its top-left cell) is clear */
  fits(r: Raster, p: number, q: number) {
    const rows = r.keepOut[p & 31];
    const w0 = p >> 5;
    for (let k = 0; k < r.h; k++) {
      const o = ((q + k) % this.NH) * this.WR + w0;
      const base = k * r.nw;
      for (let m = 0; m < r.nw; m++)
        if (rows[base + m] & (this.bits[o + m] | this.wall[o + m]))
          return false;
    }
    return true;
  }

  /** How many drawn cells lie in a raster's ring at (p, q) */
  touching(r: Raster, p: number, q: number) {
    const rows = r.ring[p & 31];
    const w0 = p >> 5;
    let n = 0;
    for (let k = 0; k < r.h; k++) {
      const o = ((q + k) % this.NH) * this.WR + w0;
      const base = k * r.nw;
      for (let m = 0; m < r.nw; m++) {
        const v = rows[base + m] & this.bits[o + m];
        if (v) n += popcount(v);
      }
    }
    return n;
  }

  draw(r: Raster, p: number, q: number, on: boolean) {
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++)
        if (r.ink[y * r.w + x])
          (on ? this.set : this.clear).call(this, p + x, q + y);
  }
}

type Spot = { p: number; q: number; score: number };

/** Whether a drawing at columns [a, a + len) reaches over the seam too far */
function overSeam(a: number, len: number, period: number, seam: number) {
  if (seam >= 0.5) return false;
  const m = ((a % period) + period) % period;
  const over = m + len - period;
  return over > seam * len && over < (1 - seam) * len;
}

/**
 * The best spot for a raster: clear of everything, as snug as can be
 * (most of its ring touching), nearer the middle (of its region, if it
 * has one; see NestItem.region) on a tie. With `seed`, the first in its
 * region: right in the middle.
 */
function bestSpot(
  board: Board,
  r: Raster,
  o: NestOpts,
  region: [number, number] | null,
  seed: boolean,
  avoid: { x: number; y: number; d: number }[] = [],
): Spot | null {
  const { NW, NH } = board;
  const mid = region ? (region[0] + region[1]) / 2 : NW / 2;
  if (seed) {
    const p = (Math.round(mid - r.w / 2) + NW) % NW,
      q = Math.round(NH / 2 - r.h / 2);
    return board.fits(r, p, q) ? { p, q, score: 0 } : null;
  }
  let best: Spot | null = null;
  const pad = RING + 1;
  for (let q = 0; q < NH; q++) {
    if (overSeam(q + r.y0, r.y1 - r.y0, NH, o.seam)) continue;
    for (let p = 0; p < NW; p++) {
      if (overSeam(p + r.x0, r.x1 - r.x0, NW, o.seam)) continue;
      const cx = (p + r.w / 2) % NW;
      if (region && (cx < region[0] || cx >= region[1])) continue;
      if (
        avoid.some((a) => {
          let ax = Math.abs(cx - a.x),
            ay = Math.abs(((q + r.h / 2) % NH) - a.y);
          ax = Math.min(ax, NW - ax);
          ay = Math.min(ay, NH - ay);
          return ax * ax + ay * ay < a.d * a.d;
        })
      )
        continue;
      // nothing near enough to touch: skip
      if (!board.anyNear(p, q, p + r.w + pad, q + r.h + pad)) continue;
      if (!board.fits(r, p, q)) continue;
      const touch = board.touching(r, p, q) / r.ringCells;
      if (touch <= 0) continue;
      // a little for being near the middle, so it grows as a whole
      let dx = Math.abs(cx - mid);
      dx = Math.min(dx, NW - dx) / NW;
      const dy = Math.abs(q + r.h / 2 - NH / 2) / NH;
      const score = touch - 0.04 * Math.hypot(dx, dy);
      if (!best || score > best.score) best = { p, q, score };
    }
  }
  return best;
}

/**
 * One go: place every item, at `scale` times its size, in the given order,
 * picking at each step whichever of the next few fits snuggest. Null if
 * one won't fit anywhere.
 */
function attempt(
  items: NestItem[],
  scale: number,
  order: number[],
  o: NestOpts,
  angles: number[],
): {
  placed: (Placed & { p: number; q: number; r: Raster })[];
  board: Board;
} | null {
  const NW = Math.round(o.W / o.cell),
    NH = Math.round(o.H / o.cell);
  const gapCells = Math.max(1, Math.round(o.gap / o.cell));
  const rasters = items.map((it, i) =>
    rasterize(it.clip, it.s * scale, angles[i], o.cell, gapCells, it.box),
  );
  const ext = Math.max(...rasters.map((r) => r.w)) + 64;
  const board = new Board(NW, NH, ext);
  if (o.wall)
    for (let y = 0; y < NH; y++)
      for (let x = 0; x < NW; x++)
        if (o.wall((x + 0.5) * o.cell, (y + 0.5) * o.cell)) board.block(x, y);
  const placed: (Placed & { p: number; q: number; r: Raster })[] = new Array(
    items.length,
  );
  const left = [...order];
  const LOOK = 3;
  // regions in cells; and which have been started
  const regionOf = (i: number): [number, number] | null => {
    const rg = items[i].region;
    return rg ? [rg[0] / o.cell, rg[1] / o.cell] : null;
  };
  const started = new Set<string>();
  while (left.length) {
    board.resum();
    let pick: { k: number; spot: Spot } | null = null;
    // the next in a region not yet started starts it, in its middle
    const fresh = left.findIndex((i) => !started.has(String(regionOf(i))));
    if (fresh >= 0 && fresh < LOOK) {
      const i = left[fresh];
      const spot = bestSpot(board, rasters[i], o, regionOf(i), true);
      if (spot) pick = { k: fresh, spot };
      started.add(String(regionOf(i)));
    }
    const seeded = pick !== null;
    for (let k = 0; !seeded && k < Math.min(LOOK, left.length); k++) {
      const i = left[k];
      if (!started.has(String(regionOf(i)))) continue;
      // where its clip already is, if it should keep away
      const d = (items[i].apart ?? 0) / o.cell;
      const avoid = d
        ? placed
            .filter((pl, j) => pl && items[j].clip === items[i].clip)
            .map((pl) => ({
              x: (pl.x / o.cell) % NW,
              y: (pl.y / o.cell) % NH,
              d,
            }))
        : [];
      const spot = bestSpot(board, rasters[i], o, regionOf(i), false, avoid);
      if (spot && (!pick || spot.score > pick.spot.score)) pick = { k, spot };
    }
    if (!pick) return null;
    const i = left.splice(pick.k, 1)[0];
    const r = rasters[i];
    board.draw(r, pick.spot.p, pick.spot.q, true);
    placed[i] = {
      x: (pick.spot.p + r.w / 2) * o.cell,
      y: (pick.spot.q + r.h / 2) * o.cell,
      s: items[i].s * scale,
      a: angles[i],
      p: pick.spot.p,
      q: pick.spot.q,
      r,
    };
  }
  return { placed, board };
}

/**
 * Pack the items. Finds the largest overall scale at which some ordering
 * fits them all, then lets each grow into the room around it.
 */
export function nest(items: NestItem[], o: NestOpts): Placed[] {
  const log = o.log ?? (() => {});
  const r = rng(o.seed);
  const gapCells = Math.max(1, Math.round(o.gap / o.cell));
  const area = (i: number) => {
    const [x0, y0, x1, y1] = items[i].clip.union;
    return (x1 - x0) * (y1 - y0) * items[i].s * items[i].s;
  };
  // resting tilts: most a little askew, bigger ones less, some square
  const areas = items.map((_, i) => area(i)).sort((a, b) => a - b);
  const median = areas[areas.length >> 1];
  const angles = items.map((_, i) => {
    if (r() < 0.3) return 0;
    const big = Math.min(1, Math.sqrt(median / area(i)));
    return (r() * 2 - 1) * ((o.tilt * Math.PI) / 180) * big;
  });
  // biggest (and most wanted in the middle) first, roughly
  const orderFor = () =>
    items
      .map((_, i) => i)
      .map((i) => ({
        i,
        k: area(i) * (items[i].priority ?? 1) * (0.7 + 0.6 * r()),
      }))
      .sort((a, b) => b.k - a.k)
      .map((e) => e.i);

  // the scale: bisect between one that surely fits and one that surely doesn't
  const total = items.reduce((sum, _, i) => sum + area(i), 0);
  let hi = Math.sqrt((o.W * o.H) / total) * 1.1;
  let lo = hi * 0.5;
  let best: ReturnType<typeof attempt> = null;
  for (let step = 0; step < 7; step++) {
    const mid = Math.sqrt(lo * hi);
    let got: ReturnType<typeof attempt> = null;
    for (let t = 0; t < o.tries && !got; t++)
      got = attempt(items, mid, orderFor(), o, angles);
    log(`  scale ${mid.toFixed(3)}: ${got ? "fits" : "doesn't fit"}`);
    if (got) {
      lo = mid;
      best = got;
    } else hi = mid;
  }
  if (!best) {
    for (let t = 0; t < 20 && !best; t++)
      best = attempt(items, lo * 0.9, orderFor(), o, angles);
    if (!best) throw new Error("nest: nothing fits");
  }

  // grow each into the room it has, a step at a time, nudging it a cell or
  // two if that helps, until nothing can grow
  const { placed, board } = best;
  const grown = items.map(() => 1);
  for (let round = 0; round < 12; round++) {
    let any = false;
    for (const i of items.map((_, i) => i).sort(() => r() - 0.5)) {
      if (grown[i] * 1.04 > o.growMax) continue;
      const pl = placed[i];
      board.draw(pl.r, pl.p, pl.q, false);
      const nr = rasterize(
        items[i].clip,
        pl.s * 1.04,
        pl.a,
        o.cell,
        gapCells,
        items[i].box,
      );
      // keep its center where it was, or a cell or two off
      const cp = pl.p + pl.r.w / 2 - nr.w / 2,
        cq = pl.q + pl.r.h / 2 - nr.h / 2;
      let ok: [number, number] | null = null;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ]) {
        const p = Math.round(cp + dx),
          q = Math.round(cq + dy);
        const NW = board.NW,
          NH = board.NH;
        const pp = ((p % NW) + NW) % NW,
          qq = ((q % NH) + NH) % NH;
        if (overSeam(pp + nr.x0, nr.x1 - nr.x0, NW, o.seam)) continue;
        if (overSeam(qq + nr.y0, nr.y1 - nr.y0, NH, o.seam)) continue;
        if (board.fits(nr, pp, qq)) {
          ok = [pp, qq];
          break;
        }
      }
      if (ok) {
        const [p, q] = ok;
        Object.assign(pl, {
          p,
          q,
          r: nr,
          s: pl.s * 1.04,
          x: (p + nr.w / 2) * o.cell,
          y: (q + nr.h / 2) * o.cell,
        });
        grown[i] *= 1.04;
        any = true;
      }
      board.draw(pl.r, pl.p, pl.q, true);
    }
    if (!any) break;
  }
  log(
    `  grew: ${grown.filter((g) => g > 1).length} of ${items.length}, by up to ${Math.max(...grown).toFixed(2)}×`,
  );
  return placed.map(({ x, y, s, a }) => ({
    x: ((x % o.W) + o.W) % o.W,
    y: ((y % o.H) + o.H) % o.H,
    s,
    a,
  }));
}
