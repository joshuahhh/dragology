import { slideFileUrl, STAGE_H } from "./slide";

// The Model-Driven and Composable Dragging art (model-driven.png is
// 1125×1620, composable.png the same shape smaller), as the live drag and
// operators slides (and the behavior diagram) show it on the right on their
// second steps
export const ART_H = 820;
export const ART_W = (ART_H * 1125) / 1620;
export const ART_CENTER_X = 1459;
export const STEP_EASE = "600ms cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * `delay` holds off its fading in (not out) by that many ms; `centerX` is
 * where it's centered across the stage
 */
export function SideArt({
  src,
  shown,
  delay = 0,
  centerX = ART_CENTER_X,
}: {
  src: string;
  shown: boolean;
  delay?: number;
  centerX?: number;
}) {
  return (
    <img
      src={slideFileUrl(src)}
      alt=""
      draggable={false}
      style={{
        position: "absolute",
        top: (STAGE_H - ART_H) / 2,
        left: centerX - ART_W / 2,
        height: ART_H,
        opacity: shown ? 1 : 0,
        // Its white background vanishes on the explainer's off-white
        mixBlendMode: "multiply",
        transition: `opacity ${STEP_EASE} ${shown ? delay : 0}ms`,
      }}
    />
  );
}
