// How the slideshow page asks the dev server to save speaker notes
// (vite-plugin-slide-notes.ts).

/** Where the page POSTs a SaveNotesRequest */
export const SAVE_NOTES_PATH = "/__slide-notes";

export type SaveNotesRequest = {
  /** Index of the slide in `outline` */
  index: number;
  /** The notes the edit started from, to catch the file changing meanwhile */
  old: string | undefined;
  notes: string;
};

export type SaveNotesResponse = {
  error?: string;
  /** Whether slides.tsx changed (and so an HMR update is on its way) */
  changed?: boolean;
};
