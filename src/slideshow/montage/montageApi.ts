// The montage layout's types, and how the editor asks the dev server to save
// a layout (vite-plugin-montage-layout.ts). Kept apart from layout.ts so the
// Vite config can import it without the layout itself.

/** A rectangle in canvas coordinates. */
export type Rect = { x: number; y: number; w: number; h: number };

export type MontageTile = Rect & {
  id: string;
  /**
   * A video in public/slides (e.g. "closing-montage/braid.mp4"), or null for a
   * placeholder for a clip still to be recorded.
   */
  file: string | null;
  /** What the placeholder shows, or a note about the clip */
  label?: string;
  /** Ids of the groups (in `MontageLayout.groups`) the tile belongs to */
  groups: string[];
};

export type MontageGroup = { id: string; label: string };

export type MontageLayout = {
  /** Gap between neighboring tiles, in canvas units */
  gutter: number;
  /** Corner radius of a tile, in canvas units */
  radius: number;
  groups: MontageGroup[];
  tiles: MontageTile[];
  /** Camera views by name. One canvas unit is one stage pixel at zoom 1. */
  views: Record<string, Rect>;
};

/** Where the editor POSTs a layout to save */
export const SAVE_MONTAGE_PATH = "/__montage-layout";

export type SaveMontageResponse = { error?: string; changed?: boolean };
