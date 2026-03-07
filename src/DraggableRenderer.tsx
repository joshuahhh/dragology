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
  DragBehaviorInitContext,
  DragFrame,
  DragResult,
  dragSpecToBehavior,
} from "./DragBehavior";
import { DragSpec } from "./DragSpec";
import { debugOverlay } from "./DragSpecTraceInfo";
import { ErrorBoundary } from "./ErrorBoundary";
import {
  DragParams,
  Draggable,
  getDragSpecCallbackOnElement,
  makeDraggableProps,
} from "./draggable";
import { Vec2 } from "./math/vec2";
import {
  renderDraggableInert,
  renderDraggableInertUnlayered,
} from "./renderDraggable";
import { Svgx, findElement, updatePropsDownTree } from "./svgx";
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
import { assert, assertNever, memoGeneric, pipe } from "./utils";

function dragParamsFromEvent(e: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): DragParams {
  return {
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    shiftKey: e.shiftKey,
  };
}

// # Engine state machine

type SpringingFrom = {
  layered: LayeredSvgx;
  time: number;
  transition: Transition;
};

function makeSpringingFrom(
  transitionLike: TransitionLike,
  /**
   * We provide this lazily cuz if the transition says "no
   * transition" then we can skip it.
   */
  layeredLazy: () => LayeredSvgx,
): SpringingFrom | null {
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
  status: DragStatus<T> & { type: "dragging" };
};

export type DragStatus<T extends object> = {
  springingFrom: SpringingFrom | null;
} & (
  | { type: "idle"; state: T; pendingDrag?: PendingDrag<T> }
  | {
      type: "dragging";
      startState: T;
      behavior: DragBehavior<T>;
      spec: DragSpec<T>;
      behaviorCtx: DragBehaviorInitContext<T>;
      pointerStart: Vec2;
      result: DragResult<T>;
      dragParamsInfo: DragParamsInfo<T>;
    }
);

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
    springingFrom: null,
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
    const currentVisual = runSpring(status.springingFrom, currentRendered);
    setStatus({
      ...status,
      state,
      springingFrom: makeSpringingFrom(true, () => currentVisual),
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
      const pointer = Vec2(e.clientX - rect.left, e.clientY - rect.top);
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
          springingFrom: status.springingFrom,
        };
        setStatus(newState);
        return;
      }

      if (status.type !== "dragging") return;
      const pointer = setPointerFromEvent(e);

      const frame: DragFrame = { pointer, pointerStart: status.pointerStart };
      const result = status.behavior(frame);
      const dropState = result.dropState;

      const newState: DragStatus<T> = {
        type: "idle",
        state: status.startState,
        springingFrom: makeSpringingFrom(result.dropTransition, () =>
          runSpring(status.springingFrom, result.rendered),
        ),
      };
      setStatus(newState);
      onDropStateRef.current?.(dropState);
      onDragStateRef.current?.(dropState);
    });

    const onKeyChange = catchToRenderError((e: KeyboardEvent) => {
      const status = statusRef.current;
      if (status.type !== "dragging") return;

      const newParams = dragParamsFromEvent(e);
      const oldParams = status.dragParamsInfo.dragParams;
      if (
        newParams.altKey === oldParams.altKey &&
        newParams.ctrlKey === oldParams.ctrlKey &&
        newParams.metaKey === oldParams.metaKey &&
        newParams.shiftKey === oldParams.shiftKey
      )
        return;

      // Re-evaluate the drag spec with new modifier keys
      const newSpec = status.dragParamsInfo.dragParamsCallback(newParams);
      const pointer = pointerRef.current;
      if (!pointer) return;

      const frame: DragFrame = { pointer, pointerStart: status.pointerStart };

      // Spring from current display
      const layered = runSpring(status.springingFrom, status.result.rendered);
      const newSpringingFrom = makeSpringingFrom(true, () => layered);

      const newStatus = initDrag(
        newSpec,
        status.dragParamsInfo.originalBehaviorCtx,
        status.dragParamsInfo.originalStartState,
        frame,
        status.pointerStart,
        newSpringingFrom,
        { ...status.dragParamsInfo, dragParams: newParams },
      );
      setStatus(newStatus);
    });

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keydown", onKeyChange);
    document.addEventListener("keyup", onKeyChange);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("keydown", onKeyChange);
      document.removeEventListener("keyup", onKeyChange);
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
 * Layers with data-transition={false} are never sprung — they
 * always show the target's version so they track the cursor.
 */
function runSpring(
  springingFrom: SpringingFrom | null,
  target: LayeredSvgx,
): LayeredSvgx {
  if (!springingFrom) return target;
  const elapsed = performance.now() - springingFrom.time;
  const t = applyEasing(springingFrom.transition, elapsed);
  const lerped = lerpLayered(target, springingFrom.layered, 1 - t);
  // Replace non-transitioning layers with the target's version so they
  // track the cursor without spring lag.
  for (const [key, element] of lerped.byId.entries()) {
    if (element.props["data-transition"] === false) {
      const targetVal = target.byId.get(key);
      if (targetVal) {
        lerped.byId.set(key, targetVal);
      }
    }
  }
  return lerped;
}

type DragParamsInfo<T extends object> = {
  dragParams: DragParams;
  dragParamsCallback: (params: DragParams) => DragSpec<T>;
  originalStartState: T;
  originalBehaviorCtx: DragBehaviorInitContext<T>;
};

function advanceFrame<T extends object>(
  status: DragStatus<T>,
  pointer: Vec2 | undefined,
  now: number,
): DragStatus<T> | null {
  if (status.type === "dragging") {
    if (!pointer) return null;
    const frame: DragFrame = { pointer, pointerStart: status.pointerStart };
    const result = status.behavior(frame);

    // Handle chaining: restart drag from new state
    const updatedDs: DragStatus<T> & { type: "dragging" } = {
      ...status,
      result,
    };
    const chained = processChainNow(updatedDs, frame);
    if (chained) return chained;

    let springingFrom = status.springingFrom;

    // Detect activePath change → start new spring from current display
    if (result.activePath !== status.result.activePath) {
      springingFrom = makeSpringingFrom(result.activePathTransition, () =>
        runSpring(springingFrom, status.result.rendered),
      );
    }

    // Clear expired spring
    if (
      springingFrom &&
      now - springingFrom.time >= springingFrom.transition?.duration!
    ) {
      springingFrom = null;
    }

    return { ...status, result, springingFrom };
  }

  if (status.type === "idle" && status.springingFrom) {
    if (
      now - status.springingFrom.time >=
      status.springingFrom.transition.duration
    ) {
      return { ...status, springingFrom: null };
    }
    // Force re-render so spring progress advances
    return { ...status };
  }

  return null;
}

/**
 * If a drag result has chainNow set (e.g. from switchToStateAndFollow),
 * process it immediately: find the new element, set up a new drag from it,
 * and return the new drag state. Returns null if no chaining needed.
 */
function processChainNow<T extends object>(
  status: DragStatus<T> & { type: "dragging" },
  frame: DragFrame,
): (DragStatus<T> & { type: "dragging" }) | null {
  const result = status.result;
  if (!result.chainNow || _.isEqual(result.dropState, status.startState))
    return null;

  const newState = result.dropState;
  const newDraggedId = result.chainNow.draggedId ?? status.behaviorCtx.draggedId;
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
    getDragSpecCallbackOnElement<T>(found.element)?.(
      status.dragParamsInfo.dragParams,
    );
  if (!newDragSpec) return null;

  const newSpringingFrom = makeSpringingFrom(true, () =>
    runSpring(status.springingFrom, result.rendered),
  );

  const newDraggedPath = getPath(found.element);
  assert(!!newDraggedPath, "Chained element must have a path");

  const pointerLocal = status.behaviorCtx.pointerLocal;
  const newPointerStart = localToGlobal(
    found.accumulatedTransform,
    pointerLocal,
  );

  const chainedResult = initDrag(
    newDragSpec,
    {
      ...status.behaviorCtx,
      draggedPath: newDraggedPath,
      draggedId: newDraggedId,
      pointerLocal,
    },
    newState,
    frame,
    newPointerStart,
    newSpringingFrom,
    status.dragParamsInfo,
  );
  // TODO: this is a hack
  // Don't chain if the new state isn't strictly closer than what we had.
  // Skip this check for explicit chains (switchToStateAndFollow) which
  // provide a followSpec — those should always proceed.
  if (
    !result.chainNow!.followSpec &&
    chainedResult.result.distance >= result.distance
  ) {
    return null;
  }
  // Try to chain further from the new state.
  const furtherChained = processChainNow(chainedResult, frame);
  return furtherChained ?? chainedResult;
}

function initDrag<T extends object>(
  spec: DragSpec<T>,
  behaviorCtx: DragBehaviorInitContext<T>,
  state: T,
  frame: DragFrame,
  pointerStart: Vec2,
  springingFrom: SpringingFrom | null,
  dragParamsInfo: DragParamsInfo<T>,
): DragStatus<T> & { type: "dragging" } {
  const behavior = dragSpecToBehavior(spec, behaviorCtx);
  // Use the canonical pointerStart (not frame.pointerStart) so that
  // the first rendered frame of a chained drag uses the correct
  // origin. processChainNow passes a frame with the *old*
  // pointerStart but a new pointerStart parameter; using the
  // parameter avoids a single-frame offset equal to the difference
  // between the two.
  const result = behavior({ ...frame, pointerStart });

  const status: DragStatus<T> & { type: "dragging" } = {
    type: "dragging",
    startState: state,
    behavior,
    spec,
    behaviorCtx,
    pointerStart,
    result,
    springingFrom,
    dragParamsInfo,
  };

  // If the result chains immediately (e.g. switchToStateAndFollow),
  // process it now so the first rendered frame is the chained drag,
  // avoiding a single-frame flash of the intermediate state.
  const chained = processChainNow(status, frame);
  if (chained) return chained;

  return status;
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
        const dragSpecCallback = getDragSpecCallbackOnElement<T>(el);
        if (!dragSpecCallback) return;
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

            const dragParams = dragParamsFromEvent(e);
            const dragSpec: DragSpec<T> = dragSpecCallback(dragParams);
            const draggedId = el.props.id ?? null;
            const draggedPath = getPath(el);
            assert(!!draggedPath, "Dragged element must have a path");

            // TODO: could instead provide the accumulatedTransform
            // via updatePropsDownTree?
            const found = findByPath(draggedPath, withPaths);
            assert(!!found, "Dragged element must be findable by path");
            const pointerLocal = globalToLocal(
              found.accumulatedTransform,
              pointer,
            );

            const behaviorCtx: DragBehaviorInitContext<T> = {
              draggable: ctx.draggable,
              draggedPath,
              draggedId,
              pointerLocal,
            };

            const frame: DragFrame = { pointer, pointerStart: pointer };
            const draggingStatus = initDrag(
              dragSpec,
              behaviorCtx,
              state,
              frame,
              pointer,
              null,
              {
                dragParams,
                dragParamsCallback: dragSpecCallback,
                originalStartState: state,
                originalBehaviorCtx: behaviorCtx,
              },
            );

            if (
              ctx.dragThreshold <= 0 ||
              (!el.props.onClick && !el.props.onDoubleClick)
            ) {
              ctx.setStatus(draggingStatus);
            } else {
              // Stay idle with pending — DOM is preserved, clicks still work.
              ctx.setStatus({
                type: "idle",
                state,
                springingFrom: null,
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
              springingFrom: makeSpringingFrom(transition, () =>
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
    return drawLayered(runSpring(status.springingFrom, layered));
  },
);

const DrawDraggingMode = memoGeneric(
  <T extends object>({
    status,
    showDebugOverlay,
    pointer,
  }: {
    status: DragStatus<T> & { type: "dragging" };
    showDebugOverlay?: boolean;
    pointer?: Vec2;
  }) => {
    const rendered = runSpring(status.springingFrom, status.result.rendered);
    return (
      <>
        {drawLayered(rendered)}
        {showDebugOverlay && pointer && (
          <ErrorBoundary>
            {debugOverlay(status.result.tracedSpec, pointer)}
          </ErrorBoundary>
        )}
      </>
    );
  },
);
