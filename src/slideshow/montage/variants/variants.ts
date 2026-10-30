// The closing montage's variants, ready to draw: the saved layouts
// (variant-layouts.json, from layouts.ts) joined up with their clips and
// with how they move (motion.ts).

import type { Rect } from "../layout";
import { CLIPS } from "./clips";
import type { VariantLayouts } from "./layouts";
import {
  BACKGROUND,
  PAN_VELOCITY,
  SIM,
  type Take,
  TAKES,
  torusOf,
  VARIANT_INFO,
  type VariantId,
} from "./motion";
import {
  type Body,
  makeBody,
  type SimParams,
  tileSize,
  type Torus,
} from "./physics";
import layoutsJson from "./variant-layouts.json";

export { VARIANT_IDS, type VariantId } from "./motion";

const layouts = layoutsJson as unknown as VariantLayouts;

export type Variant = {
  id: VariantId;
  label: string;
  blurb: string;
  bodies: Body[];
  /** The canvas repeats with this period (copies of every tile, all ways) */
  torus: Torus | null;
  /** How the bodies move; null for not at all */
  sim: SimParams | null;
  /** Camera views: "start", "start-end" (where it drifts to), "all" */
  views: Record<string, Rect>;
  /** Keep the camera gliding at this velocity (canvas units/s), always */
  panVelocity?: [number, number];
  /** As the closing slide, play as one take (see motion.ts's TAKES) */
  take?: Take;
  background: string;
  /**
   * Which tiles (by body) to multiply onto the canvas, so their white
   * hides nothing beneath: where one's drawing nests in another's empty
   * corner, their boxes overlap. Blending costs, so only tiles whose boxes
   * cover drawing beneath them are (any of them, once things move).
   */
  blend: boolean[];
  /** Stacking, by body: bigger tiles lower, so small ones nest on top */
  z: number[];
};

/**
 * Stack the tiles biggest lowest, and find which must blend: those whose
 * boxes (as turned) cover drawing of a tile below them (by its mask). A
 * small tile in a big one's corner is above it, so the big one's white
 * covers nothing of it; only a small tile's own corner over the big one's
 * drawing needs blending.
 */
function stacking(bodies: Body[], torus: Torus | null) {
  const area = (b: Body) => {
    const { w, h } = tileSize(b);
    return w * h;
  };
  const order = bodies
    .map((_, i) => i)
    .sort((i, j) => area(bodies[j]) - area(bodies[i]));
  const z = bodies.map(() => 0);
  order.forEach((i, k) => (z[i] = k));
  const ext = bodies.map((b) => {
    const { w, h } = tileSize(b);
    const c = Math.abs(Math.cos(b.a)),
      s = Math.abs(Math.sin(b.a));
    return { ex: (c * w + s * h) / 2, ey: (s * w + c * h) / 2, w, h };
  });
  /** Whether U's box covers any of L's drawing, L offset by (ox, oy) */
  const covers = (U: Body, L: Body, ox: number, oy: number) => {
    const { mw, mh, cells } = L.clip.mask;
    const { w: lw, h: lh } = ext[bodies.indexOf(L)];
    const { w: uw, h: uh } = ext[bodies.indexOf(U)];
    const lc = Math.cos(L.a),
      ls = Math.sin(L.a);
    const uc = Math.cos(U.a),
      us = Math.sin(U.a);
    for (let my = 0; my < mh; my++)
      for (let mx = 0; mx < mw; mx++) {
        if (!cells[my * mw + mx]) continue;
        const lx = ((mx + 0.5) / mw - 0.5) * lw,
          ly = ((my + 0.5) / mh - 0.5) * lh;
        const wx = L.x + ox + lc * lx - ls * ly - U.x,
          wy = L.y + oy + ls * lx + lc * ly - U.y;
        const x = uc * wx + us * wy,
          y = -us * wx + uc * wy;
        if (Math.abs(x) < uw / 2 && Math.abs(y) < uh / 2) return true;
      }
    return false;
  };
  const blend = bodies.map(() => false);
  bodies.forEach((A, i) =>
    bodies.forEach((B, j) => {
      if (z[i] <= z[j] || blend[i]) return; // A above B
      let dx = B.x - A.x,
        dy = B.y - A.y;
      if (torus) {
        dx -= torus.W * Math.round(dx / torus.W);
        dy -= torus.H * Math.round(dy / torus.H);
      }
      if (
        Math.abs(dx) >= ext[i].ex + ext[j].ex ||
        Math.abs(dy) >= ext[i].ey + ext[j].ey
      )
        return;
      if (covers(A, B, dx - (B.x - A.x), dy - (B.y - A.y))) blend[i] = true;
    }),
  );
  return { blend, z };
}

const clipsById = new Map(CLIPS.map((c) => [c.id, c]));

/** A fresh copy of a variant, for one montage to move */
export function makeVariant(id: VariantId): Variant {
  const layout = layouts[id === "pan" ? "packed" : id];
  const bodies = layout.bodies.flatMap((saved) => {
    const clip = clipsById.get(saved.id);
    if (!clip) return [];
    const b = makeBody(clip, saved.s, saved.phase);
    const { id: _, ...state } = saved;
    Object.assign(b, state, { box: [...saved.box] });
    // big tiles shove small ones, not the other way round
    const { w, h } = tileSize(b);
    b.mass = w * h;
    return [b];
  });
  // its own settings: a take speeds its flow up as it pulls back
  const sim = SIM[id] && { ...SIM[id] };
  const torus = torusOf(id);
  return {
    id,
    ...VARIANT_INFO[id],
    bodies,
    torus,
    sim,
    views: layout.views,
    panVelocity: PAN_VELOCITY[id],
    take: TAKES[id],
    background: BACKGROUND,
    ...(sim
      ? { blend: bodies.map(() => true), z: bodies.map(() => 0) }
      : stacking(bodies, torus)),
  };
}

/** A view of a variant by name; any name it doesn't have means "all" */
export function variantView(v: Variant, view: string | Rect): Rect {
  if (typeof view !== "string") return view;
  return v.views[view] ?? v.views.all;
}
