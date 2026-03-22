import { createContext } from "react";

export type StudioHackSettings = {
  // I guess these should be phrased so they're all false by default
  overlayHideDistances?: boolean;
  overlayFullOpacity?: boolean;
};

export const StudioHackContext = createContext<StudioHackSettings>({});
