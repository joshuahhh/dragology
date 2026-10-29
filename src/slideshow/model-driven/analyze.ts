// What the model-driven-dragging explainer shows about a drag: the states
// the dragged element's drag spec offers, each rendered, and where the
// element lands in each. Worked out the way the engine itself does at the
// start of a drag, by building the spec's operators.

import _ from "lodash";
import { DragInitContext, getElementPositionCheap } from "../../DragBehavior";
import { Draggable, getOnDragCallbackOnElement } from "../../draggable";
import { Vec2 } from "../../math/vec2";
import { Operator } from "../../op";
import {
  renderDraggableInert,
  renderDraggableInertUnlayered,
} from "../../renderDraggable";
import { findElement } from "../../svgx";
import { boundsCenter, getLocalBounds } from "../../svgx/bounds";
import { LayeredSvgx } from "../../svgx/layers";
import { getPath } from "../../svgx/path";
import { assert } from "../../utils/assert";

export type Candidate<T extends object> = {
  state: T;
  /** The state, rendered as the engine would preview it */
  layered: LayeredSvgx;
  /** Where the dragged element's center lands, in canvas coordinates */
  pos: Vec2;
  /** Whether this is the state the drag starts from */
  isStart: boolean;
};

export type DragAnalysis<T extends object> = {
  start: Candidate<T>;
  /** The drop states, in the spec's order (the start state among them) */
  candidates: Candidate<T>[];
  /** Half the dragged element's bounds' width and height */
  elementHalfSize: Vec2;
};

/**
 * Analyze a drag of the element with id `draggedId`. The candidates are the
 * states of the first `closest` or `between` in the element's drag spec (or
 * every `fixed` state in it, if it has neither).
 */
export function analyzeDrag<T extends object>(
  draggable: Draggable<T>,
  state: T,
  draggedId: string,
): DragAnalysis<T> {
  const content = renderDraggableInertUnlayered(
    draggable,
    state,
    draggedId,
    true,
  );
  const found = findElement(content, (el) => el.props.id === draggedId);
  assert(!!found, `analyzeDrag: no element with id "${draggedId}"`);
  const bounds = getLocalBounds(found.element);
  assert(!bounds.empty, "analyzeDrag: the dragged element has no bounds");
  const onDrag = getOnDragCallbackOnElement<T>(found.element);
  assert(!!onDrag, "analyzeDrag: the element isn't draggable");
  const draggedPath = getPath(found.element);
  assert(!!draggedPath, "analyzeDrag: the element has no path");

  const ctx: DragInitContext<T> = {
    draggable,
    draggedPath,
    draggedId,
    // Grab it by its center
    anchorPos: boundsCenter(bounds),
    startState: state,
    debug: { varyVisualizer: false },
  };
  const spec = onDrag();
  const root = new spec.opClass(ctx, ...spec.args);
  const choice = findOp(root, (op) => ["closest", "between"].includes(op.name));
  const fixedStates =
    choice?.name === "between"
      ? // A `between` of states renders them itself, rather than running
        // them as `fixed` children
        (
          choice as unknown as { renderedStates: { state: T }[] }
        ).renderedStates.map((r) => r.state)
      : opsNamed(choice ?? root, "fixed")
          // `fixed` ops keep their state in a field of that name
          .map((op) => (op as unknown as { state: T }).state);

  const candidate = (s: T): Candidate<T> => {
    const pos = getElementPositionCheap(ctx, s);
    assert(!!pos, "analyzeDrag: a candidate state lacks the dragged element");
    return {
      state: s,
      // Drawn as at rest, not as mid-drag
      layered: renderDraggableInert(draggable, s, null, false),
      pos,
      isStart: _.isEqual(s, state),
    };
  };

  return {
    start: candidate(state),
    candidates: fixedStates.map(candidate),
    elementHalfSize: Vec2(
      (bounds.maxX - bounds.minX) / 2,
      (bounds.maxY - bounds.minY) / 2,
    ),
  };
}

function findOp<T extends object>(
  op: Operator<T>,
  pred: (op: Operator<T>) => boolean,
): Operator<T> | undefined {
  if (pred(op)) return op;
  for (const child of op.children) {
    const found = findOp(child.op, pred);
    if (found) return found;
  }
  return undefined;
}

function opsNamed<T extends object>(
  op: Operator<T>,
  name: string,
): Operator<T>[] {
  if (op.name === name) return [op];
  return op.children.flatMap((child) => opsNamed(child.op, name));
}
