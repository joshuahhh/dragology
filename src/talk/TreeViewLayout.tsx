import { type ReactNode, useCallback, useState } from "react";
import { StudioHackContext } from "../studio/StudioHackContext";

/**
 * Dimensions of `TreeViewLayout`, in its own units (it's zoomed to fit
 * the stage).
 */
export const TREE_LAYOUT = {
  width: 960,
  height: 540,
  /** Space above and left of the label and the diagram. */
  pad: 20,
  diagramZoom: 1.2,
  /** The most the tree is laid out across. */
  treeWidth: 500,
  /** Space right of and above the tree, and between it and what it
   * avoids. */
  treePad: 10,
  /** Space below the tree: as much as below the ring of beads, which
   * draws down to about y = 258 of its 300 (zoomed by `diagramZoom`). */
  treeBottom: 50,
};

/** The smallest scale a tree is shrunk to, to fit. */
const MIN_TREE_SCALE = 0.3;

/**
 * The studio's layout for showing a drag's spec tree (after
 * studio/RingOfBeadsSection): a label at the top left, the diagram
 * below it, and the tree on the right, level with the diagram's bottom.
 *
 * The tree is narrowed to what its boxes need (laid out `treeWidth`
 * across, their rows of thumbnails may not fill it), and shrunk, if need
 * be, to fit, clear of whatever it should `avoid`.
 */
export function TreeViewLayout({
  label,
  diagram,
  tree,
  treeWidth = TREE_LAYOUT.treeWidth,
  avoid = [],
  paperOps = false,
}: {
  label: ReactNode;
  diagram: ReactNode;
  /** The tree, if a drag is on. */
  tree: ReactNode;
  treeWidth?: number;
  /** Points the tree mustn't cover, or reach below and right of, in
   * layout units: e.g. the ends of lines of code. */
  avoid?: { right: number; bottom: number }[];
  /** Style op names as the paper does (see `StudioHackSettings`). */
  paperOps?: boolean;
}) {
  const { width, height, pad, diagramZoom, treePad, treeBottom } = TREE_LAYOUT;

  // The tree's size at full scale, at the narrowest width that wraps it
  // the same as `treeWidth` does (so no taller). Found by trying widths,
  // whenever its contents change size.
  const [treeSize, setTreeSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const treeRef = useCallback(
    (el: HTMLDivElement | null) => {
      const content = el?.firstElementChild;
      if (!el || !content) return;
      const fit = () => {
        el.style.width = `${treeWidth}px`;
        const fullHeight = el.offsetHeight;
        const fitsAt = (w: number) => {
          el.style.width = `${w}px`;
          return el.offsetHeight === fullHeight && el.scrollWidth <= w;
        };
        let lo = 0;
        let hi = treeWidth;
        while (hi - lo > 1) {
          const mid = Math.floor((lo + hi) / 2);
          if (fitsAt(mid)) hi = mid;
          else lo = mid;
        }
        el.style.width = `${hi}px`;
        setTreeSize((prev) =>
          prev?.width === hi && prev.height === fullHeight
            ? prev
            : { width: hi, height: fullHeight },
        );
      };
      const observer = new ResizeObserver(fit);
      observer.observe(content);
      return () => observer.disconnect();
    },
    [treeWidth],
  );

  // The largest scale, up to full size, at which the tree (anchored at
  // the bottom right) stays inside the layout and clear of `avoid`
  let treeScale = 1;
  if (treeSize) {
    const right = width - treePad;
    const bottom = height - treeBottom;
    const clear = (scale: number) => {
      const left = right - treeSize.width * scale;
      const top = bottom - treeSize.height * scale;
      return (
        top >= treePad &&
        avoid.every(
          (p) => p.right + treePad <= left || p.bottom + treePad <= top,
        )
      );
    };
    while (treeScale > MIN_TREE_SCALE && !clear(treeScale)) {
      treeScale -= 0.01;
    }
  }

  return (
    <StudioHackContext.Provider value={{ tightFixed: true, paperOps }}>
      <div style={{ display: "flex", width, height }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: `${pad}px 0 0 ${pad}px`,
            flexShrink: 0,
          }}
        >
          {label}
          <div style={{ zoom: diagramZoom }}>{diagram}</div>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "flex-end",
            overflow: "hidden",
            padding: `${treePad}px ${treePad}px ${treeBottom}px 0`,
          }}
        >
          {tree && (
            // Scaled about its bottom-right corner, where it's anchored.
            // (A transform, unlike zoom, leaves its measured size alone.)
            <div
              ref={treeRef}
              style={{
                width: treeSize?.width ?? treeWidth,
                flexShrink: 0,
                overflow: "hidden",
                transform: `scale(${treeScale})`,
                transformOrigin: "bottom right",
              }}
            >
              {/* Opaque, so code it covers doesn't show through */}
              <div style={{ background: "white" }}>{tree}</div>
            </div>
          )}
        </div>
      </div>
    </StudioHackContext.Provider>
  );
}
