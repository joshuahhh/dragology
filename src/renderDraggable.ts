import { Draggable, makeDraggableProps } from "./draggable";
import { Svgx } from "./svgx";
import { LayeredSvgx, layerSvg, layeredExtract } from "./svgx/layers";
import { assignPaths } from "./svgx/path";
import { localToGlobal } from "./svgx/transform";
import { Vec2 } from "./math/vec2";
import { pipe, throwError } from "./utils";

/** Render a state through assignPaths, but stop before layering. */
export function renderDraggableInertUnlayered<T extends object>(
  draggable: Draggable<T>,
  state: T,
  draggedId: string | null,
  isTracking: boolean,
): Svgx {
  return pipe(
    draggable(
      makeDraggableProps({
        state,
        draggedId,
        setState: throwError,
        isTracking,
      }),
    ),
    assignPaths,
  );
}

export function renderDraggableInert<T extends object>(
  draggable: Draggable<T>,
  state: T,
  draggedId: string | null,
  isTracking: boolean,
): LayeredSvgx {
  return layerSvg(
    renderDraggableInertUnlayered(draggable, state, draggedId, isTracking),
  );
}

/**
 * Render a state and extract the float context for a dragged element:
 * the floatLayered (the extracted element layer) and the pointerStart
 * (where pointerLocal maps to in the element's global coordinates).
 */
export function extractFloatContext<T extends object>(
  draggable: Draggable<T>,
  state: T,
  draggedId: string,
  pointerLocal: Vec2,
): { floatLayered: LayeredSvgx; pointerStart: Vec2 } {
  const layered = renderDraggableInert(draggable, state, draggedId, false);
  const { extracted } = layeredExtract(layered, draggedId);
  const element = layered.byId.get(draggedId)!;
  const pointerStart = localToGlobal(element.props.transform, pointerLocal);
  return { floatLayered: extracted, pointerStart };
}
