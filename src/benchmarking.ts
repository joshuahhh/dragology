import { DragInitContext } from "./DragBehavior";
import { draggable, singleRowState } from "./demos/lists-in-lists";
import {
  OnDragCallback,
  getOnDragCallbackOnElement,
  makeDraggableProps,
} from "./draggable";
import { Vec2 } from "./math/vec2";
import { findElement } from "./svgx";
import { assignPaths } from "./svgx/path";

type ListsInListsState = ReturnType<typeof singleRowState>;

export function setupListsInListsBenchmark(n: number): {
  callback: OnDragCallback<ListsInListsState>;
  ctx: DragInitContext<ListsInListsState>;
  pointer: ReturnType<typeof Vec2>;
} {
  const state = singleRowState(n);

  const content = assignPaths(
    draggable(
      makeDraggableProps({
        state,
        draggedId: "A0",
        setState: () => {
          throw new Error("should not be called");
        },
        isTracking: false,
      }),
    ),
  );

  const found = findElement(content, (el) => el.props.id === "A0");
  if (!found) throw new Error("Tile A0 not found");

  const callback = getOnDragCallbackOnElement<ListsInListsState>(found.element);
  if (!callback) throw new Error("No drag callback on A0");

  const pointer = Vec2(100, 100);

  const ctx: DragInitContext<ListsInListsState> = {
    draggable,
    draggedPath: "A0/",
    draggedId: "A0",
    anchorPos: pointer,
    startState: state,
    debug: { varyVisualizer: false, trace: false },
  };

  return { callback, ctx, pointer };
}

import {
  draggable as pivotDraggable,
  initialState as pivotInitialState,
} from "./demos/pivot-table";

type PivotTableState = typeof pivotInitialState;

/**
 * Pivot table: many elements (hundreds of cells/headers as layers), few
 * candidate states. Drags the chip for the given field (e.g. "quarter").
 */
export function setupPivotTableBenchmark(field: string): {
  callback: OnDragCallback<PivotTableState>;
  ctx: DragInitContext<PivotTableState>;
  pointer: ReturnType<typeof Vec2>;
} {
  const state = pivotInitialState;
  const draggedId = `chip-${field}`;

  const content = assignPaths(
    pivotDraggable(
      makeDraggableProps({
        state,
        draggedId,
        setState: () => {
          throw new Error("should not be called");
        },
        isTracking: false,
      }),
    ),
  );

  const found = findElement(content, (el) => el.props.id === draggedId);
  if (!found) throw new Error(`${draggedId} not found`);

  const callback = getOnDragCallbackOnElement<PivotTableState>(found.element);
  if (!callback) throw new Error(`No drag callback on ${draggedId}`);

  const pointer = Vec2(300, 30);

  const ctx: DragInitContext<PivotTableState> = {
    draggable: pivotDraggable,
    draggedPath: `${draggedId}/`,
    draggedId,
    anchorPos: pointer,
    startState: state,
    debug: { varyVisualizer: false, trace: false },
  };

  return { callback, ctx, pointer };
}
