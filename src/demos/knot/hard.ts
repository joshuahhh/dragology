// Classic hard diagrams, for the puzzle presets.
//
// Gauss codes are from Appendix A of Burton et al., "Hard diagrams of
// the unknot" (arXiv:2104.14076). Planar layouts come from
// spherogram's OrthogonalLinkDiagram (plink_data: vertices, arrows as
// vertex-index pairs, and crossings as [over arrow, under arrow,
// virtual, label]); hard-layouts.py regenerates hard-layouts.json.

import { Pt, pt } from "./geometry";
import layouts from "./hard-layouts.json";
import { Knot, knotFromPolyline } from "./knot";

type PlinkData = {
  verts: number[][];
  arrows: number[][];
  crossings: (number | boolean)[][];
};

export type HardName = keyof typeof layouts;

/**
 * Turn an orthogonal plink drawing into a diagram, scaled to fit a box
 * centered at (cx, cy).
 */
export function knotFromPlink(
  data: PlinkData,
  cx: number,
  cy: number,
  w: number,
  h: number,
): Knot {
  const { verts, arrows, crossings } = data;
  // follow the arrows around the (single) component
  const order: number[] = [arrows[0][0]];
  const arrowOrder: number[] = [];
  for (let guard = 0; guard < arrows.length; guard++) {
    const last = order[order.length - 1];
    const ai = arrows.findIndex((a) => a[0] === last);
    arrowOrder.push(ai);
    if (arrows[ai][1] === order[0]) break;
    order.push(arrows[ai][1]);
  }
  const xs = verts.map((v) => v[0]);
  const ys = verts.map((v) => v[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const sc = Math.min(w / (Math.max(...xs) - x0), h / (Math.max(...ys) - y0));
  const place = (v: number[]): Pt =>
    pt(
      cx + (v[0] - x0 - (Math.max(...xs) - x0) / 2) * sc,
      cy + (v[1] - y0 - (Math.max(...ys) - y0) / 2) * sc,
    );
  // densify, remembering which arrow each polyline segment lies on
  const poly: Pt[] = [];
  const segArrow: number[] = [];
  order.forEach((vi, k) => {
    const a = place(verts[vi]);
    const b = place(verts[order[(k + 1) % order.length]]);
    const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    for (let s = 0; s < steps; s++) {
      poly.push(
        pt(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps),
      );
      segArrow.push(arrowOrder[k]);
    }
  });
  const over = new Map<string, number>();
  for (const c of crossings) {
    const [o, u] = c as number[];
    over.set(`${Math.min(o, u)}:${Math.max(o, u)}`, o);
  }
  return knotFromPolyline(poly, (u, other) => {
    const a = segArrow[Math.floor(u) % poly.length];
    const b = segArrow[Math.floor(other) % poly.length];
    return over.get(`${Math.min(a, b)}:${Math.max(a, b)}`) === a;
  });
}

export function hardKnot(name: HardName): Knot {
  return knotFromPlink(layouts[name], 280, 225, 420, 300);
}
