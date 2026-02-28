import _ from "lodash";
import React, {
  SetStateAction,
  useCallback,
  useEffect,
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
import { DragSpec, DragSpecBuilder, DragSpecData } from "./DragSpec";
import { debugOverlay } from "./DragSpecTraceInfo";
import { ErrorBoundary } from "./ErrorBoundary";
import {
  DragParams,
  Draggable,
  getDragSpecCallbackOnElement,
} from "./draggable";
import { Vec2 } from "./math/vec2";
import {
  renderDraggableInert,
  renderDraggableInertUnlayered,
} from "./renderDraggable";
import { Svgx, findElement, updatePropsDownTree } from "./svgx";
import {
  LayeredSvgx,
  drawLayered,
  layerSvg,
  layeredExtract,
} from "./svgx/layers";
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

type PendingDrag<T extends object> = {
  startClientPos: Vec2;
  threshold: number;
  dragState: DragState<T> & { type: "dragging" };
  debugInfo: DebugDragInfo<T>;
};

type DragState<T extends object> = { springingFrom: SpringingFrom | null } & (
  | { type: "idle"; state: T; pendingDrag?: PendingDrag<T> }
  | {
      type: "dragging";
      startState: T;
      behavior: DragBehavior<T>;
      spec: DragSpec<T>;
      behaviorCtx: DragBehaviorInitContext<T>;
      pointerStart: Vec2;
      draggedId: string | null;
      result: DragResult<T>;
      dragParamsInfo: DragParamsInfo<T>;
    }
);

// # Debug info

export type DebugDragInfo<T extends object> =
  | { type: "idle"; state: T }
  | {
      type: "dragging";
      spec: DragSpec<T>;
      behaviorCtx: DragBehaviorInitContext<T>;
      activePath: string;
      pointerStart: Vec2;
      draggedId: string | null;
      dropState: T;
      tracedSpec: DragSpecData<T>;
    };

// # Component

interface DraggableRendererProps<T extends object> {
  draggable: Draggable<T>;
  initialState: T;
  width?: number;
  height?: number;
  onDebugDragInfo?: (info: DebugDragInfo<T>) => void;
  showDebugOverlay?: boolean;
  /**
   * Minimum pointer movement (in px) before a pointerdown becomes a drag.
   * Below this threshold the gesture is treated as a click — the state
   * machine stays idle, so onClick handlers on the element fire normally.
   * Set to 0 to start drags immediately (old behavior). Default: 2.
   */
  dragThreshold?: number;
}

export function DraggableRenderer<T extends object>({
  draggable,
  initialState,
  width,
  height,
  onDebugDragInfo,
  showDebugOverlay,
  dragThreshold = 2,
}: DraggableRendererProps<T>) {
  const catchToRenderError = useCatchToRenderError();

  const [dragState, setDragState, dragStateRef] = useStateWithRef<DragState<T>>(
    {
      type: "idle",
      state: initialState,
      springingFrom: null,
    },
  );
  const pointerRef = useRef<Vec2 | undefined>(undefined);
  const onDebugDragInfoRef = useRef(onDebugDragInfo);
  onDebugDragInfoRef.current = onDebugDragInfo;

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
        dragStateRef.current,
        pointerRef.current,
        performance.now(),
      );
      if (result) {
        setDragState(result.dragState);
        onDebugDragInfoRef.current?.(result.debugInfo);
      }
    }),
  );

  // Cursor style
  useEffect(() => {
    document.body.style.cursor =
      dragState.type === "dragging" ? "grabbing" : "default";
  }, [dragState.type]);

  // Document-level pointer listeners during drag or pending drag
  const shouldListenToPointer =
    dragState.type === "dragging" ||
    (dragState.type === "idle" && !!dragState.pendingDrag);
  useEffect(() => {
    if (!shouldListenToPointer) return;

    const onPointerMove = catchToRenderError((e: globalThis.PointerEvent) => {
      const ds = dragStateRef.current;
      if (ds.type === "idle" && ds.pendingDrag) {
        // Pending: check threshold
        const { pendingDrag: pending } = ds;
        const clientPos = Vec2(e.clientX, e.clientY);
        const d = clientPos.sub(pending.startClientPos);
        if (d.len2() > pending.threshold * pending.threshold) {
          setPointerFromEvent(e);
          setDragState(pending.dragState);
          onDebugDragInfoRef.current?.(pending.debugInfo);
        }
      } else {
        // Dragging: track pointer
        setPointerFromEvent(e);
      }
    });

    const onPointerUp = catchToRenderError((e: globalThis.PointerEvent) => {
      const ds = dragStateRef.current;
      if (ds.type === "idle" && ds.pendingDrag) {
        // Released before threshold — clear pending, stay idle.
        const newState: DragState<T> = {
          type: "idle",
          state: ds.state,
          springingFrom: ds.springingFrom,
        };
        setDragState(newState);
        return;
      }

      if (ds.type !== "dragging") return;
      const pointer = setPointerFromEvent(e);

      const frame: DragFrame = { pointer, pointerStart: ds.pointerStart };
      const result = ds.behavior(frame);
      const dropState = result.dropState;

      const newState: DragState<T> = {
        type: "idle",
        state: dropState,
        springingFrom: makeSpringingFrom(result.dropTransition, () =>
          runSpring(ds.springingFrom, result.rendered),
        ),
      };
      setDragState(newState);
      onDebugDragInfoRef.current?.({ type: "idle", state: dropState });
    });

    const onKeyChange = catchToRenderError((e: KeyboardEvent) => {
      const ds = dragStateRef.current;
      if (ds.type !== "dragging") return;

      const newParams = dragParamsFromEvent(e);
      const oldParams = ds.dragParamsInfo.dragParams;
      if (
        newParams.altKey === oldParams.altKey &&
        newParams.ctrlKey === oldParams.ctrlKey &&
        newParams.metaKey === oldParams.metaKey &&
        newParams.shiftKey === oldParams.shiftKey
      )
        return;

      // Re-evaluate the drag spec with new modifier keys
      const newSpec = ds.dragParamsInfo.dragParamsCallback(newParams);
      const pointer = pointerRef.current;
      if (!pointer) return;

      const frame: DragFrame = { pointer, pointerStart: ds.pointerStart };

      // Spring from current display
      const layered = runSpring(ds.springingFrom, ds.result.rendered);
      const newSpringingFrom = makeSpringingFrom(true, () => layered);

      const { dragState: newDragState, debugInfo } = initDrag(
        newSpec,
        ds.dragParamsInfo.originalBehaviorCtxWithoutFloat,
        ds.dragParamsInfo.originalStartState,
        frame,
        ds.pointerStart,
        newSpringingFrom,
        { ...ds.dragParamsInfo, dragParams: newParams },
      );
      setDragState(newDragState);
      onDebugDragInfoRef.current?.(debugInfo);
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
    dragStateRef,
    shouldListenToPointer,
    setDragState,
    setPointerFromEvent,
  ]);

  const renderCtx: RenderContext<T> = useMemo(
    () => ({
      draggable,
      catchToRenderError,
      setPointerFromEvent,
      setDragState,
      onDebugDragInfoRef,
      dragThreshold,
    }),
    [
      catchToRenderError,
      draggable,
      dragThreshold,
      setDragState,
      setPointerFromEvent,
    ],
  );

  return (
    <svg
      ref={setSvgElem}
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      className="overflow-visible select-none touch-none"
    >
      {dragState.type === "idle" ? (
        <DrawIdleMode dragState={dragState} ctx={renderCtx} />
      ) : dragState.type === "dragging" ? (
        <DrawDraggingMode
          dragState={dragState}
          showDebugOverlay={showDebugOverlay}
          pointer={pointerRef.current}
        />
      ) : (
        assertNever(dragState)
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
  originalBehaviorCtxWithoutFloat: Omit<
    DragBehaviorInitContext<T>,
    "floatLayered"
  >;
};

type InitDragResult<T extends object> = {
  dragState: DragState<T> & { type: "dragging" };
  debugInfo: DebugDragInfo<T>;
};

function debugInfoFromDragState<T extends object>(
  ds: DragState<T> & { type: "dragging" },
): DebugDragInfo<T> {
  return {
    type: "dragging",
    spec: ds.spec,
    behaviorCtx: ds.behaviorCtx,
    activePath: ds.result.activePath,
    pointerStart: ds.pointerStart,
    draggedId: ds.draggedId,
    dropState: ds.result.dropState,
    tracedSpec: ds.result.tracedSpec,
  };
}

function advanceFrame<T extends object>(
  ds: DragState<T>,
  pointer: Vec2 | undefined,
  now: number,
): { dragState: DragState<T>; debugInfo: DebugDragInfo<T> } | null {
  if (ds.type === "dragging") {
    if (!pointer) return null;
    const frame: DragFrame = { pointer, pointerStart: ds.pointerStart };
    const result = ds.behavior(frame);

    // Handle chaining: restart drag from new state
    const updatedDs: DragState<T> & { type: "dragging" } = { ...ds, result };
    const chained = processChainNow(updatedDs, frame);
    if (chained) return chained;

    let springingFrom = ds.springingFrom;

    // Detect activePath change → start new spring from current display
    if (result.activePath !== ds.result.activePath) {
      springingFrom = makeSpringingFrom(result.activePathTransition, () =>
        runSpring(springingFrom, ds.result.rendered),
      );
    }

    // Clear expired spring
    if (
      springingFrom &&
      now - springingFrom.time >= springingFrom.transition?.duration!
    ) {
      springingFrom = null;
    }

    return {
      dragState: { ...ds, result, springingFrom },
      debugInfo: debugInfoFromDragState({ ...ds, result }),
    };
  }

  if (ds.type === "idle" && ds.springingFrom) {
    if (now - ds.springingFrom.time >= ds.springingFrom.transition.duration) {
      return {
        dragState: { ...ds, springingFrom: null },
        debugInfo: { type: "idle", state: ds.state },
      };
    }
    // Force re-render so spring progress advances
    return {
      dragState: { ...ds },
      debugInfo: { type: "idle", state: ds.state },
    };
  }

  return null;
}

/**
 * If a drag result has chainNow set (e.g. from switchToStateAndFollow),
 * process it immediately: find the new element, set up a new drag from it,
 * and return the new drag state. Returns null if no chaining needed.
 */
function processChainNow<T extends object>(
  ds: DragState<T> & { type: "dragging" },
  frame: DragFrame,
): InitDragResult<T> | null {
  const result = ds.result;
  if (!result.chainNow || _.isEqual(result.dropState, ds.startState))
    return null;

  const newState = result.dropState;
  const newDraggedId = result.chainNow.draggedId ?? ds.draggedId;
  const content = renderDraggableInertUnlayered(
    ds.behaviorCtx.draggable,
    newState,
    newDraggedId,
    true,
  );
  const found = newDraggedId
    ? findElement(content, (el) => el.props.id === newDraggedId)
    : findByPath(ds.behaviorCtx.draggedPath, content);

  assert(
    !!found,
    `Chained drag must have a valid dragged element; couldn't find element with id ${newDraggedId}`,
  );

  const newDragSpec =
    result.chainNow.followSpec ??
    getDragSpecCallbackOnElement<T>(found.element)?.(
      ds.dragParamsInfo.dragParams,
    );
  if (!newDragSpec) return null;

  const newSpringingFrom = makeSpringingFrom(true, () =>
    runSpring(ds.springingFrom, result.rendered),
  );

  const newDraggedPath = getPath(found.element);
  assert(!!newDraggedPath, "Chained element must have a path");

  const pointerLocal = ds.behaviorCtx.pointerLocal;
  const newPointerStart = localToGlobal(
    found.accumulatedTransform,
    pointerLocal,
  );

  const { floatLayered: _fl, ...behaviorCtxWithoutFloat } = ds.behaviorCtx;
  const chainedResult = initDrag(
    newDragSpec,
    {
      ...behaviorCtxWithoutFloat,
      draggedPath: newDraggedPath,
      draggedId: newDraggedId,
      pointerLocal,
    },
    newState,
    frame,
    newPointerStart,
    newSpringingFrom,
    ds.dragParamsInfo,
  );
  // TODO: this is a hack
  // Don't chain if the new state isn't strictly closer than what we had.
  // Skip this check for explicit chains (switchToStateAndFollow) which
  // provide a followSpec — those should always proceed.
  if (
    !result.chainNow!.followSpec &&
    chainedResult.dragState.result.distance >= result.distance
  ) {
    return null;
  }
  // Try to chain further from the new state.
  const furtherChained = processChainNow(chainedResult.dragState, frame);
  return furtherChained ?? chainedResult;
}

function initDrag<T extends object>(
  spec: DragSpec<T>,
  behaviorCtxWithoutFloat: Omit<DragBehaviorInitContext<T>, "floatLayered">,
  state: T,
  frame: DragFrame,
  pointerStart: Vec2,
  springingFrom: SpringingFrom | null,
  dragParamsInfo: DragParamsInfo<T>,
): {
  dragState: DragState<T> & { type: "dragging" };
  debugInfo: DebugDragInfo<T>;
} {
  const { draggable, draggedId } = behaviorCtxWithoutFloat;
  let floatLayered: LayeredSvgx | null = null;
  if (draggedId) {
    const startLayered = renderDraggableInert(
      draggable,
      state,
      draggedId,
      false,
    );
    floatLayered = layeredExtract(startLayered, draggedId).extracted;
  }
  const behaviorCtx: DragBehaviorInitContext<T> = {
    ...behaviorCtxWithoutFloat,
    floatLayered,
  };
  const behavior = dragSpecToBehavior(spec, behaviorCtx);
  // Use the canonical pointerStart (not frame.pointerStart) so that
  // the first rendered frame of a chained drag uses the correct
  // origin. processChainNow passes a frame with the *old*
  // pointerStart but a new pointerStart parameter; using the
  // parameter avoids a single-frame offset equal to the difference
  // between the two.
  const result = behavior({ ...frame, pointerStart });

  const dragState: DragState<T> & { type: "dragging" } = {
    type: "dragging",
    startState: state,
    behavior,
    spec,
    behaviorCtx,
    pointerStart,
    draggedId,
    result,
    springingFrom,
    dragParamsInfo,
  };

  // If the result chains immediately (e.g. switchToStateAndFollow),
  // process it now so the first rendered frame is the chained drag,
  // avoiding a single-frame flash of the intermediate state.
  const chained = processChainNow(dragState, frame);
  if (chained) return chained;

  return {
    dragState,
    debugInfo: debugInfoFromDragState(dragState),
  };
}

// # Render context

type RenderContext<T extends object> = {
  draggable: Draggable<T>;
  catchToRenderError: CatchToRenderError;
  setPointerFromEvent: (e: globalThis.PointerEvent) => Vec2;
  setDragState: (ds: DragState<T>) => void;
  onDebugDragInfoRef: React.RefObject<
    ((info: DebugDragInfo<T>) => void) | undefined
  >;
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

            const behaviorCtxWithoutFloat = {
              draggable: ctx.draggable,
              draggedPath,
              draggedId,
              pointerLocal,
            };

            const frame: DragFrame = { pointer, pointerStart: pointer };
            const { dragState: draggingState, debugInfo } = initDrag(
              dragSpec,
              behaviorCtxWithoutFloat,
              state,
              frame,
              pointer,
              null,
              {
                dragParams,
                dragParamsCallback: dragSpecCallback,
                originalStartState: state,
                originalBehaviorCtxWithoutFloat: behaviorCtxWithoutFloat,
              },
            );

            if (
              ctx.dragThreshold <= 0 ||
              (!el.props.onClick && !el.props.onDoubleClick)
            ) {
              ctx.setDragState(draggingState);
              ctx.onDebugDragInfoRef.current?.(debugInfo);
            } else {
              // Stay idle with pending — DOM is preserved, clicks still work.
              ctx.setDragState({
                type: "idle",
                state,
                springingFrom: null,
                pendingDrag: {
                  startClientPos: Vec2(e.clientX, e.clientY),
                  threshold: ctx.dragThreshold,
                  dragState: draggingState,
                  debugInfo,
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
    dragState,
    ctx,
  }: {
    dragState: DragState<T> & { type: "idle" };
    ctx: RenderContext<T>;
  }) => {
    const content = ctx.draggable({
      state: dragState.state,
      d: new DragSpecBuilder<T>(dragState.state),
      draggedId: null,
      setState: ctx.catchToRenderError(
        (
          newState: SetStateAction<T>,
          { transition }: { transition?: TransitionLike } = {},
        ) => {
          const resolved =
            typeof newState === "function"
              ? (newState as (prev: T) => T)(dragState.state)
              : newState;
          ctx.setDragState({
            type: "idle",
            state: resolved,
            springingFrom: makeSpringingFrom(transition, () =>
              renderDraggableInert(ctx.draggable, dragState.state, null, false),
            ),
          });
          ctx.onDebugDragInfoRef.current?.({ type: "idle", state: resolved });
        },
      ),
      isTracking: false,
    });

    const layered = postProcessForInteraction(content, dragState.state, ctx);
    return drawLayered(runSpring(dragState.springingFrom, layered));
  },
);

const DrawDraggingMode = memoGeneric(
  <T extends object>({
    dragState,
    showDebugOverlay,
    pointer,
  }: {
    dragState: DragState<T> & { type: "dragging" };
    showDebugOverlay?: boolean;
    pointer?: Vec2;
  }) => {
    const rendered = runSpring(
      dragState.springingFrom,
      dragState.result.rendered,
    );
    return (
      <>
        {drawLayered(rendered)}
        {showDebugOverlay && pointer && (
          <ErrorBoundary>
            {debugOverlay(dragState.result.tracedSpec, pointer)}
          </ErrorBoundary>
        )}
      </>
    );
  },
);
