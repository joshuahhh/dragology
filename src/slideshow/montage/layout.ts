// The montage's layout: tiles of looping videos on a big canvas, plus named
// camera views onto it. The data lives in layout.json, which the montage
// editor (#/montage-editor) rewrites through the dev server
// (vite-plugin-montage-layout.ts).

import layoutJson from "./layout.json";

import type { MontageLayout, MontageTile, Rect } from "./montageApi";

export type {
  MontageGroup,
  MontageLayout,
  MontageTile,
  Rect,
} from "./montageApi";

export const montageLayout = layoutJson as MontageLayout;

/** The smallest rect containing every tile */
export function tilesBounds(tiles: MontageTile[]): Rect {
  if (tiles.length === 0) return { x: 0, y: 0, w: 1920, h: 1080 };
  const x0 = Math.min(...tiles.map((t) => t.x));
  const y0 = Math.min(...tiles.map((t) => t.y));
  const x1 = Math.max(...tiles.map((t) => t.x + t.w));
  const y1 = Math.max(...tiles.map((t) => t.y + t.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A view by name, or the bounds of every tile for a name with no view */
export function resolveView(layout: MontageLayout, view: string | Rect): Rect {
  if (typeof view !== "string") return view;
  return layout.views[view] ?? tilesBounds(layout.tiles);
}
