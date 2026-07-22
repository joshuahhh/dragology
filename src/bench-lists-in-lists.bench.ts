// Scaling of drag-start cost with interface size, for a reorderable
// row of n tiles. Run with `npm run bench`.
//
// Caveat: absolute numbers here are inflated several-fold relative to
// a production build (dev-mode React jsx runtime + vite module
// proxies). Trust the scaling curves and relative comparisons, not
// the absolute times. For production-accurate numbers, bundle a
// driver script with esbuild --define:process.env.NODE_ENV='"production"'
// and run it under plain node.
import { bench, describe } from "vitest";
import { DragInitContext, dragSpecToBehavior } from "./DragBehavior";
import { DragSpec } from "./DragSpec";
import { draggable, singleRowState } from "./demos/lists-in-lists";
import { getOnDragCallbackOnElement, makeDraggableProps } from "./draggable";
import { findElement } from "./svgx";
import { boundsCenter, getLocalBounds } from "./svgx/bounds";
import { assignPaths, getPath } from "./svgx/path";
import { globalToLocal, localToGlobal } from "./svgx/transform";

type State = ReturnType<typeof singleRowState>;

function setupDragForTile(n: number) {
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

  const callback = getOnDragCallbackOnElement<State>(found.element);
  if (!callback) throw new Error("No drag callback on A0");

  const localBounds = getLocalBounds(found.element);
  if (localBounds.empty) throw new Error("Empty bounds for A0");
  const center = boundsCenter(localBounds);
  const pointer = localToGlobal(found.accumulatedTransform, center);
  const anchorPos = globalToLocal(found.accumulatedTransform, pointer);

  const draggedPath = getPath(found.element);
  if (!draggedPath) throw new Error("No path for A0");

  const dragSpec: DragSpec<State> = callback();

  const ctx: DragInitContext<State> = {
    draggable,
    draggedPath,
    draggedId: "A0",
    anchorPos,
    startState: state,
    debug: { varyVisualizer: false, trace: false },
  };

  return { dragSpec, ctx, pointer };
}

const sizes = [2, 4, 8, 16, 32, 64];

describe("dragSpecToBehavior for lists-in-lists", () => {
  for (const n of sizes) {
    const { dragSpec, ctx } = setupDragForTile(n);

    bench(`singleRowState(${n})`, () => {
      dragSpecToBehavior(dragSpec, ctx);
    });
  }
});

describe("init + first frame for lists-in-lists", () => {
  for (const n of sizes) {
    const { dragSpec, ctx, pointer } = setupDragForTile(n);

    bench(`singleRowState(${n})`, () => {
      const behavior = dragSpecToBehavior(dragSpec, ctx);
      behavior({ pointer });
    });
  }
});

describe("init + first frame + preview for lists-in-lists", () => {
  for (const n of sizes) {
    const { dragSpec, ctx, pointer } = setupDragForTile(n);

    bench(`singleRowState(${n})`, () => {
      const behavior = dragSpecToBehavior(dragSpec, ctx);
      behavior({ pointer }).preview();
    });
  }
});
