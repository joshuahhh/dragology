import _ from "lodash";
import React, {
  SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DragBehavior,
  DragFrame,
  DragInitContext,
  DragResult,
  dragSpecToBehavior,
} from "./DragBehavior";
import { DragSpec } from "./DragSpec";
import { ErrorBoundary } from "./ErrorBoundary";
import { OverlayVis } from "./OverlayVis";
import {
  Draggable,
  getOnDragCallbackOnElement,
  makeDraggableProps,
} from "./draggable";
import { Vec2 } from "./math/vec2";
import {
  renderDraggableInert,
  renderDraggableInertUnlayered,
} from "./renderDraggable";
import {
  Svgx,
  findElement,
  shouldRecurseIntoChildren,
  updatePropsDownTree,
} from "./svgx";
import { LayeredSvgx, drawLayered, layerSvg } from "./svgx/layers";
import { lerpLayered } from "./svgx/lerp";
import { assignPaths, findByPath, getPath } from "./svgx/path";
import { globalToLocal, localToGlobal } from "./svgx/transform";
import {
  Transition,
  TransitionLike,
  applyEasing,
  resolveTransitionLike,
} from "./transition";
import { useAnimationLoop } from "./useAnimationLoop";
import { CatchToRenderError, useCatchToRenderError } from "./useRenderError";
import { useStateWithRef } from "./useStateWithRef";
import { memoGeneric } from "./utils";
import { assert, assertNever } from "./utils/assert";
import { pipe } from "./utils/pipe";

// # Engine state machine

type SpringOrigin = {
  layered: LayeredSvgx;
  time: number;
  transition: Transition;
};

function makeSpringOrigin(
  transitionLike: TransitionLike,
  /**
   * We provide this lazily cuz if the transition says "no
   * transition" then we can skip it.
   */
  layeredLazy: () => LayeredSvgx,
): SpringOrigin | null {
  const transition = resolveTransitionLike(transitionLike);
  if (transition === false) return null;
  return {
    layered: layeredLazy(),
    time: performance.now(),
    transition,
  };
}

/**
 * Tracks a pointer-down that hasn't yet exceeded the movement
 * threshold to become a full drag.
 */
type PendingDrag<T extends object> = {
  startClientPos: Vec2;
  threshold: number;
  status: DragStatusDragging<T>;
};

/*
A bit of terminology about the lifetimes of drags:

- A "drag" is the user-facing pointer-down/pointer-move/pointer-up
  thing we all know and love.

- A "drag span" is the portion of a drag running under a fixed drag
  behavior. A drag can consist of multiple drag spans due to
  chaining: When we chain, we move into a new state and re-initialize
  the drag from that new state, starting a new, chained span.

  A drag span is initialized in a few steps:

  - Get ahold of a OnDragCallback – extract from rendered SVGX or use
    a saved one.
  - Evaluate the OnDragCallback to get a DragSpec.
  - Turn the DragSpec into a DragBehavior using dragSpecToBehavior,
    providing some DragInitContext.

*/

export type DragStatus<T extends object> = {
  springOrigin: SpringOrigin | null;
} & (
  | { type: "idle"; state: T; pendingDrag?: PendingDrag<T> }
  | {
      type: "dragging";
      startState: T; // TODO: this is of suspect utility
      behavior: DragBehavior<T>;
      behaviorCtx: DragInitContext<T>;
      result: DragResult<T>;
      /**
       * We save the drag spec so we can generate fresh behaviors for
       * the drop-zone visualization. It's named in a scary way to
       * remind you that it's a niche use case.
       */
      specForDropZoneVis: DragSpec<T>;
    }
);
type DragStatusDragging<T extends object> = DragStatus<T> & {
  type: "dragging";
};

// # Component

export interface DraggableRendererBaseProps<T extends object> {
  draggable: Draggable<T>;
  width?: number;
  height?: number;
  onDropState?: (state: T) => void;
  onDragState?: (state: T) => void;
  onDragStatus?: (dragStatus: DragStatus<T>) => void;
  showDebugOverlay?: boolean;
  /**
   * Minimum pointer movement (in px) before a pointerdown becomes a drag.
   * Below this threshold the gesture is treated as a click — the state
   * machine stays idle, so onClick handlers on the element fire normally.
   * Set to 0 to start drags immediately (old behavior). Default: 2.
   */
  dragThreshold?: number;
}

export type DraggableRendererProps<T extends object> =
  DraggableRendererBaseProps<T> &
    (
      | { state: T; initialState?: undefined }
      | { state?: undefined; initialState: T }
    );

export function DraggableRenderer<T extends object>({
  state,
  initialState,
  ...rest
}: DraggableRendererProps<T>) {
  assert(
    !(state !== undefined && initialState !== undefined),
    "DraggableRenderer: provide either 'state' or 'initialState', not both",
  );
  if (state !== undefined) {
    return <DraggableRendererControlled {...rest} state={state} />;
  }
  return (
    <DraggableRendererUncontrolled {...rest} initialState={initialState!} />
  );
}

function DraggableRendererUncontrolled<T extends object>({
  initialState,
  onDropState,
  ...rest
}: DraggableRendererBaseProps<T> & { initialState: T }) {
  const [state, setState] = useState(initialState);
  const handleStateChange = useCallback(
    (newState: T) => {
      setState(newState);
      onDropState?.(newState);
    },
    [onDropState],
  );
  return (
    <DraggableRendererControlled
      {...rest}
      state={state}
      onDropState={handleStateChange}
    />
  );
}

function DraggableRendererControlled<T extends object>({
  draggable,
  state,
  width,
  height,
  onDropState,
  onDragState,
  onDragStatus,
  showDebugOverlay,
  dragThreshold = 2,
}: DraggableRendererBaseProps<T> & { state: T }) {
  const catchToRenderError = useCatchToRenderError();

  const [status, setStatus, statusRef] = useStateWithRef<DragStatus<T>>({
    type: "idle",
    state,
    springOrigin: null,
  });

  // Sync internal idle state from props.state (with spring animation).
  // This covers both prop changes and post-drop corrections (where the
  // idle state reverts to startState but the prop already reflects the
  // drop target, e.g. because onDragState updated the parent mid-drag).
  if (status.type === "idle" && status.state !== state) {
    const currentRendered = renderDraggableInert(
      draggable,
      status.state,
      null,
      false,
    );
    const currentVisual = runSpring(status.springOrigin, currentRendered);
    setStatus({
      ...status,
      state,
      springOrigin: makeSpringOrigin(true, () => currentVisual),
    });
  }

  useEffect(() => {
    onDragStatus?.(status);
  }, [status, onDragStatus]);

  // Fire onDragState when dropState changes during drag.
  // Drop-time firing is handled imperatively in onPointerUp.
  const prevDropStateRef = useRef<T | undefined>(undefined);
  useLayoutEffect(() => {
    const dropState =
      status.type === "dragging" ? status.result.dropState : undefined;
    if (dropState !== undefined && dropState !== prevDropStateRef.current) {
      onDragState?.(dropState);
    }
    prevDropStateRef.current = dropState;
  }, [status, onDragState]);

  const pointerRef = useRef<Vec2 | undefined>(undefined);
  const onDropStateRef = useRef(onDropState);
  onDropStateRef.current = onDropState;
  const onDragStateRef = useRef(onDragState);
  onDragStateRef.current = onDragState;

  const [svgElem, setSvgElem] = useState<SVGSVGElement | null>(null);

  const setPointerFromEvent = useCallback(
    (e: globalThis.PointerEvent) => {
      assert(!!svgElem);
      const rect = svgElem.getBoundingClientRect();
      const scale =
        svgElem.width.baseVal.value !== 0
          ? rect.width / svgElem.width.baseVal.value
          : 1;
      const pointer = Vec2(
        (e.clientX - rect.left) / scale,
        (e.clientY - rect.top) / scale,
      );
      pointerRef.current = pointer;
      return pointer;
    },
    [svgElem],
  );

  // Animation loop: update dragging states and spring decay each frame.
  useAnimationLoop(
    catchToRenderError(() => {
      const result = advanceFrame(
        statusRef.current,
        pointerRef.current,
        performance.now(),
      );
      if (result) {
        setStatus(result);
      }
    }),
  );

  // Cursor style
  useEffect(() => {
    document.body.style.cursor =
      status.type === "dragging" ? "grabbing" : "default";
  }, [status.type]);

  // Document-level pointer listeners during drag or pending drag
  const shouldListenToPointer =
    status.type === "dragging" ||
    (status.type === "idle" && !!status.pendingDrag);
  useEffect(() => {
    if (!shouldListenToPointer) return;

    const onPointerMove = catchToRenderError((e: globalThis.PointerEvent) => {
      const status = statusRef.current;
      if (status.type === "idle" && status.pendingDrag) {
        // Pending: check threshold
        const { pendingDrag: pending } = status;
        const clientPos = Vec2(e.clientX, e.clientY);
        const d = clientPos.sub(pending.startClientPos);
        if (d.len2() > pending.threshold * pending.threshold) {
          setPointerFromEvent(e);
          setStatus(pending.status);
        }
      } else {
        // Dragging: track pointer
        setPointerFromEvent(e);
      }
    });

    const onPointerUp = catchToRenderError((e: globalThis.PointerEvent) => {
      const status = statusRef.current;
      if (status.type === "idle" && status.pendingDrag) {
        // Released before threshold — clear pending, stay idle.
        const newState: DragStatus<T> = {
          type: "idle",
          state: status.state,
          springOrigin: status.springOrigin,
        };
        setStatus(newState);
        return;
      }

      if (status.type !== "dragging") return;
      const pointer = setPointerFromEvent(e);

      const frame: DragFrame = { pointer };
      const result = status.behavior(frame);
      const dropState = result.dropState;

      const newState: DragStatus<T> = {
        type: "idle",
        state: dropState,
        springOrigin: makeSpringOrigin(result.dropTransition, () =>
          runSpring(status.springOrigin, result.preview),
        ),
      };
      setStatus(newState);
      onDropStateRef.current?.(dropState);
      onDragStateRef.current?.(dropState);
    });

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [
    catchToRenderError,
    statusRef,
    shouldListenToPointer,
    setStatus,
    setPointerFromEvent,
  ]);

  const renderCtx: RenderContext<T> = useMemo(
    () => ({
      draggable,
      catchToRenderError,
      setPointerFromEvent,
      setStatus,
      onDropState,
      dragThreshold,
    }),
    [
      catchToRenderError,
      draggable,
      dragThreshold,
      onDropState,
      setStatus,
      setPointerFromEvent,
    ],
  );

  return (
    <svg
      ref={setSvgElem}
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible", userSelect: "none", touchAction: "none" }}
    >
      {status.type === "idle" ? (
        <DrawIdleMode status={status} ctx={renderCtx} />
      ) : status.type === "dragging" ? (
        <DrawDraggingMode
          status={status}
          showDebugOverlay={showDebugOverlay}
          pointer={pointerRef.current}
        />
      ) : (
        assertNever(status)
      )}
    </svg>
  );
}

// # Helpers

/**
 * Blends a target render with a spring's startLayered.
 * The target is used as the base (first arg to lerpLayered) so its
 * non-interpolatable props (like event handlers) are preserved.
 * Layers with dragologyTransition={false} are never sprung — they
 * always show the target's version so they track the cursor.
 */
function runSpring(
  springOrigin: SpringOrigin | null,
  target: LayeredSvgx,
): LayeredSvgx {
  if (!springOrigin) return target;
  const elapsed = performance.now() - springOrigin.time;
  const t = applyEasing(springOrigin.transition, elapsed);
  const lerped = lerpLayered(target, springOrigin.layered, 1 - t);
  // Replace non-transitioning layers with the target's version so they
  // track the cursor without spring lag.
  for (const [key, element] of lerped.byId.entries()) {
    if (element.props["dragologyTransition"] === false) {
      const targetVal = target.byId.get(key);
      if (targetVal) {
        lerped.byId.set(key, targetVal);
      }
    }
  }
  return lerped;
}

function advanceFrame<T extends object>(
  status: DragStatus<T>,
  pointer: Vec2 | undefined,
  now: number,
): DragStatus<T> | null {
  if (status.type === "dragging") {
    if (!pointer) return null;
    const frame: DragFrame = { pointer };
    const result = status.behavior(frame);

    // Handle chaining: restart drag from new state
    const chained = resolveChainNows(status, frame, result);
    if (chained !== status) return chained;

    let springOrigin = status.springOrigin;

    // Detect activePath change → start new spring from current display
    if (result.activePath !== status.result.activePath) {
      springOrigin = makeSpringOrigin(result.activePathTransition, () =>
        runSpring(springOrigin, status.result.preview),
      );
    }

    // Clear expired spring
    if (
      springOrigin &&
      now - springOrigin.time >= springOrigin.transition?.duration!
    ) {
      springOrigin = null;
    }

    return { ...status, result, springOrigin };
  }

  if (status.type === "idle" && status.springOrigin) {
    if (
      now - status.springOrigin.time >=
      status.springOrigin.transition.duration
    ) {
      return { ...status, springOrigin: null };
    }
    // Force re-render so spring progress advances
    return { ...status };
  }

  return null;
}

/**
 * If a drag result has chainNow set (e.g. from switchToStateAndFollow),
 * process it immediately: find the new element, set up a new drag from it,
 * and return the new drag state. Returns the original status if no chaining needed.
 */
function resolveChainNows<T extends object>(
  status: DragStatusDragging<T>,
  frame: DragFrame,
  result: DragResult<T>,
): DragStatusDragging<T> {
  if (!result.chainNow || _.isEqual(result.dropState, status.startState))
    return status;

  const newState = result.dropState;
  const newDraggedId =
    result.chainNow.draggedId ?? status.behaviorCtx.draggedId;
  const content = renderDraggableInertUnlayered(
    status.behaviorCtx.draggable,
    newState,
    newDraggedId,
    true,
  );
  const found = newDraggedId
    ? findElement(content, (el) => el.props.id === newDraggedId)
    : findByPath(status.behaviorCtx.draggedPath, content);

  assert(
    !!found,
    `Chained drag must have a valid dragged element; couldn't find element with id ${newDraggedId}`,
  );

  const newDragSpec =
    result.chainNow.followSpec ??
    getOnDragCallbackOnElement<T>(found.element)?.();
  if (!newDragSpec) return status;

  // We construct a spring origin to emulate what was rendered here
  // before. That means: no references to the new `result`!
  const newSpringOrigin = makeSpringOrigin(true, () =>
    runSpring(status.springOrigin, status.result.preview),
  );

  const newDraggedPath = getPath(found.element);
  assert(!!newDraggedPath, "Chained element must have a path");

  const anchorPos = status.behaviorCtx.anchorPos;
  const newPointerStart = localToGlobal(found.accumulatedTransform, anchorPos);

  return initDrag(
    newDragSpec,
    {
      ...status.behaviorCtx,
      draggedPath: newDraggedPath,
      draggedId: newDraggedId,
      anchorPos,
      pointerStart: newPointerStart,
      startState: newState,
    },
    newState,
    frame,
    newSpringOrigin,
  );
}

function initDrag<T extends object>(
  spec: DragSpec<T>,
  behaviorCtx: DragInitContext<T>,
  state: T,
  frame: DragFrame,
  springOrigin: SpringOrigin | null,
): DragStatusDragging<T> {
  const behavior = dragSpecToBehavior(spec, behaviorCtx);
  const result = behavior(frame);

  const status: DragStatusDragging<T> = {
    type: "dragging",
    startState: state,
    behavior,
    specForDropZoneVis: spec,
    behaviorCtx,
    result,
    springOrigin,
  };

  // If the result chains immediately (e.g. switchToStateAndFollow),
  // process it now so the first rendered frame is the chained drag,
  // avoiding a single-frame flash of the intermediate state.
  return resolveChainNows(status, frame, result);
}

// # Render context

type RenderContext<T extends object> = {
  draggable: Draggable<T>;
  catchToRenderError: CatchToRenderError;
  setPointerFromEvent: (e: globalThis.PointerEvent) => Vec2;
  setStatus: (ds: DragStatus<T>) => void;
  onDropState?: (state: T) => void;
  dragThreshold: number;
};

/**
 * Checks whether the element at `targetPath` or any of its ancestors
 * in the JSX tree has an onClick or onDoubleClick handler.
 */
function ancestorOrSelfHasClickHandler(
  root: Svgx,
  targetPath: string,
): boolean {
  const nodePath = getPath(root);

  // Not on the path to the target — skip this subtree
  if (nodePath && !targetPath.startsWith(nodePath)) return false;

  if (root.props.onClick || root.props.onDoubleClick) return true;

  // Reached the target — no need to go deeper
  if (nodePath === targetPath) return false;

  if (!shouldRecurseIntoChildren(root)) return false;
  const children = React.Children.toArray(root.props.children);
  for (const child of children) {
    if (React.isValidElement(child)) {
      if (ancestorOrSelfHasClickHandler(child as Svgx, targetPath)) return true;
    }
  }
  return false;
}

function postProcessForInteraction<T extends object>(
  content: Svgx,
  state: T,
  ctx: RenderContext<T>,
): LayeredSvgx {
  const withPaths = assignPaths(content);
  return pipe(
    withPaths,
    (el) =>
      updatePropsDownTree(el, (el) => {
        const onDragCallback = getOnDragCallbackOnElement<T>(el);
        if (!onDragCallback) return;
        assert(
          !el.props.onPointerDown,
          "Elements with dragology cannot have onPointerDown (it is overwritten)",
        );
        return {
          // put cursor first, so it's overriden by author-defined cursor
          style: { cursor: "grab", ...(el.props.style || {}) },
          onPointerDown: ctx.catchToRenderError((e: React.PointerEvent) => {
            e.stopPropagation();
            const pointer = ctx.setPointerFromEvent(e.nativeEvent);

            const dragSpec: DragSpec<T> = onDragCallback();
            const draggedId = el.props.id ?? null;
            const draggedPath = getPath(el);
            assert(!!draggedPath, "Dragged element must have a path");

            // TODO: could instead provide the accumulatedTransform
            // via updatePropsDownTree?
            const found = findByPath(draggedPath, withPaths);
            assert(!!found, "Dragged element must be findable by path");
            const anchorPos = globalToLocal(
              found.accumulatedTransform,
              pointer,
            );

            const behaviorCtx: DragInitContext<T> = {
              draggable: ctx.draggable,
              draggedPath,
              draggedId,
              anchorPos,
              pointerStart: pointer,
              startState: state,
            };

            const frame: DragFrame = { pointer };
            const draggingStatus = initDrag(
              dragSpec,
              behaviorCtx,
              state,
              frame,
              null,
            );

            const hasClickHandler = ancestorOrSelfHasClickHandler(
              withPaths,
              draggedPath,
            );

            if (ctx.dragThreshold <= 0 || !hasClickHandler) {
              ctx.setStatus(draggingStatus);
            } else {
              // Stay idle with pending — DOM is preserved, clicks still work.
              ctx.setStatus({
                type: "idle",
                state,
                springOrigin: null,
                pendingDrag: {
                  startClientPos: Vec2(e.clientX, e.clientY),
                  threshold: ctx.dragThreshold,
                  status: draggingStatus,
                },
              });
            }
          }),
        };
      }),
    layerSvg,
  );
}

// # Render modes

const DrawIdleMode = memoGeneric(
  <T extends object>({
    status,
    ctx,
  }: {
    status: DragStatus<T> & { type: "idle" };
    ctx: RenderContext<T>;
  }) => {
    const content = ctx.draggable(
      makeDraggableProps({
        state: status.state,
        draggedId: null,
        setState: ctx.catchToRenderError(
          (
            newState: SetStateAction<T>,
            { transition }: { transition?: TransitionLike } = {},
          ) => {
            const resolved =
              typeof newState === "function"
                ? (newState as (prev: T) => T)(status.state)
                : newState;
            const newStatus: DragStatus<T> = {
              type: "idle",
              state: resolved,
              springOrigin: makeSpringOrigin(transition, () =>
                renderDraggableInert(ctx.draggable, status.state, null, false),
              ),
            };
            ctx.setStatus(newStatus);
            ctx.onDropState?.(resolved);
          },
        ),
        isTracking: false,
      }),
    );

    const layered = postProcessForInteraction(content, status.state, ctx);
    return drawLayered(runSpring(status.springOrigin, layered));
  },
);

const DrawDraggingMode = memoGeneric(
  <T extends object>({
    status,
    showDebugOverlay,
    pointer,
  }: {
    status: DragStatusDragging<T>;
    showDebugOverlay?: boolean;
    pointer?: Vec2;
  }) => {
    const rendered = runSpring(status.springOrigin, status.result.preview);
    return (
      <>
        {drawLayered(rendered)}
        {showDebugOverlay && pointer && (
          <ErrorBoundary>
            <OverlayVis spec={status.result.tracedSpec} pointer={pointer} />
          </ErrorBoundary>
        )}
      </>
    );
  },
);
