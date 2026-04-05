import "react";
import { DragSpecBrand } from "./DragSpec";

declare module "react" {
  interface SVGAttributes<T> {
    /**
     * Custom attribute for attaching drag specifications to SVG elements.
     * Set to a function returning a DragSpec.
     *
     * @example
     * <circle dragologyOnDrag={() => d.vary(state, [["x"], ["y"]])} />
     *
     * @example
     * <rect dragologyOnDrag={() => d.between([state1, state2])} />
     */
    dragologyOnDrag?: (() => DragSpecBrand) | false | null | undefined;

    dragologyZIndex?: number | string | false | null;
    dragologyTransition?: boolean;
    dragologyEmergeFrom?: string;
    dragologyEmergeMode?: "clone" | "scale";
    dragologyOpaque?: boolean;
  }
}
