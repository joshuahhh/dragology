import { createContext } from "react";

export type StudioHackSettings = {
  // I guess these should be phrased so they're all false by default
  overlayHideDistances?: boolean;
  overlayFullOpacity?: boolean;
  tightFixed?: boolean;
  /** Op names in spec-tree labels styled as in the paper
   * (`PAPER_OP_STYLE`) */
  paperOps?: boolean;
};

/**
 * How the paper styles operators' names (its `\fn` macro): bold italic
 * Libertine, teal, on a pale teal tint. A notch bigger than the text
 * around it, which reads larger in a serif at the same size. (The talk
 * bundles the face, as 'Paper Libertine': talk/libertine.ts.)
 */
export const PAPER_OP_STYLE = {
  color: "#008f88",
  background: "#ecf6f2",
  fontFamily: '"Paper Libertine", "Linux Libertine O", Georgia, serif',
  fontWeight: 700,
  fontStyle: "italic",
  fontSize: "1.15em",
  lineHeight: 1,
} as const;

export const StudioHackContext = createContext<StudioHackSettings>({});
