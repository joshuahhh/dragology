// The montage's layouts: tiles of looping videos on a big canvas, plus named
// camera views onto it. There are two: "grid" (cards packed edge to edge on
// a dark canvas) and "loose" (bare clips scattered on white). The data lives
// in layout.json and layout-loose.json, which the montage editor
// (#/montage-editor) rewrites through the dev server
// (vite-plugin-montage-layout.ts).

import looseJson from "./layout-loose.json";
import gridJson from "./layout.json";

import type {
  MontageLayout,
  MontageLayoutName,
  MontageTile,
  Rect,
} from "./montageApi";

export type {
  MontageGroup,
  MontageLayout,
  MontageLayoutName,
  MontageTile,
  Rect,
} from "./montageApi";

export const montageLayouts: Record<MontageLayoutName, MontageLayout> = {
  grid: gridJson as MontageLayout,
  loose: looseJson as MontageLayout,
};

/** The layout the closing slide shows */
export const ACTIVE_MONTAGE_LAYOUT: MontageLayoutName = "grid";

export const montageLayout = montageLayouts[ACTIVE_MONTAGE_LAYOUT];

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
