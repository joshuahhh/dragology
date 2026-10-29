// How the slideshow page asks the dev server to write to slides.tsx: speaker
// notes, and timings from a run-through (vite-plugin-slide-notes.ts).

/** Where the page POSTs a SaveNotesRequest */
export const SAVE_NOTES_PATH = "/__slide-notes";

export type SaveNotesRequest = {
  /** Index of the slide in `outline` */
  index: number;
  /** The notes the edit started from, to catch the file changing meanwhile */
  old: string | undefined;
  notes: string;
};

/** Where the page POSTs a SaveTimingsRequest */
export const SAVE_TIMINGS_PATH = "/__slide-timings";

export type SaveTimingsRequest = {
  /** How many entries `outline` had when the run started, to catch slides
   * being added or removed meanwhile */
  outlineLength: number;
  slides: {
    /** Index of the slide in `outline` */
    index: number;
    /** Seconds on each of the slide's steps */
    timing: number[];
  }[];
};

export type SaveResponse = {
  error?: string;
  /** Whether slides.tsx changed (and so an HMR update is on its way) */
  changed?: boolean;
};
