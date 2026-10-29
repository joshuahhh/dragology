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
  /**
   * How tiles are drawn: "card" (the default) puts each clip on a white
   * rounded card; "bare" draws just the clips, on the canvas's background.
   */
  tileStyle?: "card" | "bare";
  /** The canvas's color, behind the tiles (default near-black) */
  background?: string;
  /**
   * Play each clip's transparent .webm twin (next to its .mp4) instead of the
   * mp4, so bare clips sit on a background that isn't white.
   */
  alpha?: boolean;
  groups: MontageGroup[];
  tiles: MontageTile[];
  /** Camera views by name. One canvas unit is one stage pixel at zoom 1. */
  views: Record<string, Rect>;
};

/** The montage's layouts, by name, and the file each is saved in */
export const MONTAGE_LAYOUT_FILES = {
  grid: "src/slideshow/montage/layout.json",
  loose: "src/slideshow/montage/layout-loose.json",
} as const;
export type MontageLayoutName = keyof typeof MONTAGE_LAYOUT_FILES;

/** Where the editor POSTs a layout to save, with `?name=<layout name>` */
export const SAVE_MONTAGE_PATH = "/__montage-layout";

export type SaveMontageResponse = { error?: string; changed?: boolean };
