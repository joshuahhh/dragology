import { Draggable } from "./draggable";
import { DragSpecBuilder } from "./DragSpec";
import { Svgx } from "./svgx";
import { LayeredSvgx, layerSvg } from "./svgx/layers";
import { assignPaths } from "./svgx/path";
import { pipe, throwError } from "./utils";

/** Render a state through assignPaths, but stop before layering. */
export function renderDraggableInertUnlayered<T extends object>(
  draggable: Draggable<T>,
  state: T,
  draggedId: string | null,
  isTracking: boolean,
): Svgx {
  return pipe(
    draggable({
      state,
      d: new DragSpecBuilder<T>(state),
      draggedId,
      setState: throwError,
      isTracking,
    }),
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
