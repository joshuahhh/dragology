import { PrettyPrint } from "@joshuahhh/pretty-print";
import _ from "lodash";
import {
  Draggable,
  getDragSpecCallbackOnElement,
  makeDraggableProps,
} from "./draggable";
import { Chaining, DragSpecData } from "./DragSpec";
import { setTraceInfo } from "./DragSpecTraceInfo";
import { ErrorWithJSX } from "./ErrorBoundary";
import {
  CoincidentPointsError,
  ConvexHullProjection,
  Delaunay,
} from "./math/delaunay";
import { naturalNeighborWeightsFromDelaunay } from "./math/natural-neighbor";
import { DistanceMinimizer } from "./math/optimization";
import { Vec2 } from "./math/vec2";
import { getAtPath, setAtPath } from "./paths";
import {
  extractFloatContext,
  renderDraggableInert,
  renderDraggableInertUnlayered,
} from "./renderDraggable";
import { findElement } from "./svgx";
import { getLocalBounds, pointInBounds } from "./svgx/bounds";
import { translate } from "./svgx/helpers";
import {
  findByPathInLayered,
  layeredExtract,
  layeredMerge,
  layeredPrefixIds,
  layeredSetAttributes,
  layeredShiftZIndices,
  LayeredSvgx,
  layeredTransform,
} from "./svgx/layers";
import { lerpLayeredWeighted } from "./svgx/lerp";
import { findByPath } from "./svgx/path";
import { globalToLocal, localToGlobal, parseTransform } from "./svgx/transform";
import { Transition } from "./transition";
import { assert, assertNever } from "./utils/assert";
import {
  ManyReader,
  manyReaderToArray,
  Reader,
  readerToValue,
} from "./utils/flexible-types";
import { pipe } from "./utils/pipe";

/**
 * A "drag behavior" defines the ongoing behavior of a drag – what is
 * displayed – as well as what state the draggable will transition
 * into on drop. At least so far, it is assumed to be "memoryless".
 */
export type DragBehavior<T> = (frame: DragFrame) => DragResult<T>;

/**
 * The information passed to a drag behavior on every frame of the
 * drag.
 */
export type DragFrame = {
  pointer: Vec2;
};

/**
 * The information returned by a drag behavior on every frame of the
 * drag.
 */
export type DragResult<T> = {
  rendered: LayeredSvgx;
  dropState: T;
  dropTransition?: Transition | false;
  activePathTransition?: Transition | false;
  gap: number;
  activePath: string;
  chainNow?: Chaining<T>;
  /**
   * The spec tree with runtime trace info attached via `traceInfo` fields.
   */
  tracedSpec: DragSpecData<T>;
};

/**
 * The information available to a drag behavior when it's being
 * created from a DragSpec.
 */
export type DragBehaviorInitContext<T extends object> = {
  draggable: Draggable<T>;
  draggedPath: string;
  draggedId: string | null;
  pointerLocal: Vec2;
  pointerStart: Vec2;
  startState: T;
};

/**
 * Turn a DragSpec into a DragBehavior, given the necessary context.
 * This is where the semantics of each DragSpec type are defined.
 */
export function dragSpecToBehavior<T extends object>(
  spec: DragSpecData<T>,
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  switch (spec.type) {
    case "fixed":
      return fixedBehavior(spec, ctx);
    case "with-floating":
      return withFloatingBehavior(spec, ctx);
    case "closest":
      return closestBehavior(spec, ctx);
    case "when-far":
      return whenFarBehavior(spec, ctx);
    case "on-drop":
      return onDropBehavior(spec, ctx);
    case "during":
      return duringBehavior(spec, ctx);
    case "vary":
      return varyBehavior(spec, ctx);
    case "change-result":
      return changeResultBehavior(spec, ctx);
    case "change-gap":
      return changeGapBehavior(spec, ctx);
    case "with-snap-radius":
      return withSnapRadiusBehavior(spec, ctx);
    case "with-drop-transition":
      return withDropTransitionBehavior(spec, ctx);
    case "with-branch-transition":
      return withBranchTransitionBehavior(spec, ctx);
    case "between":
      return betweenBehavior(spec, ctx);
    case "switch-to-state-and-follow":
      return switchToStateAndFollowBehavior(spec, ctx);
    case "drop-target":
      return dropTargetBehavior(spec, ctx);
    case "with-chaining":
      return withChainingBehavior(spec, ctx);
    case "substate":
      return substateBehavior(spec, ctx);
    case "react-to":
      return reactToBehavior(spec, ctx);
    case "with-init-context":
      return withInitContextBehavior(spec, ctx);
    default:
      assertNever(spec);
  }
}

// # Per-type behavior constructors

function fixedBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "fixed" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const rendered = renderStateReadOnly(ctx, spec.state);
  const elementPos = getElementPosition(ctx, rendered);
  const tracedSpec = setTraceInfo(spec, {
    renderedStates: [{ layered: rendered, position: elementPos }],
  });
  return (frame) => {
    const gap = frame.pointer.dist(elementPos);
    return {
      rendered,
      dropState: spec.state,
      gap,
      activePath: "fixed",
      tracedSpec,
    };
  };
}

function withFloatingBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "with-floating" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const { draggedId } = ctx;
  assert(
    draggedId !== null,
    "Floating drags require the dragged element to have an id",
  );
  const innerBehavior = dragSpecToBehavior(spec.inner, ctx);

  // Cache the latest float element for frames where the inner result
  // doesn't contain the dragged element.
  let cachedFloatLayered: LayeredSvgx | null = null;
  let cachedFloatPos: Vec2 | null = null;
  // The element position on the first frame (used to keep the float
  // anchored to the cursor regardless of inner-result interpolation).
  let startFloatPos: Vec2 | null = null;

  return (frame) => {
    const innerResult = innerBehavior(frame);
    const layered = innerResult.rendered;
    // On a layer, the transform prop IS the accumulated transform.
    const draggedElement = layered.byId.get(draggedId);
    const elementPos = draggedElement
      ? localToGlobal(draggedElement.props.transform, ctx.pointerLocal)
      : Vec2(Infinity, Infinity);

    // Extract the float element from the inner result, or fall back to cache.
    let floatLayered: LayeredSvgx;
    let floatPos: Vec2;
    let backdrop: LayeredSvgx;
    if (!draggedElement) {
      if (cachedFloatLayered === null) {
        // The dragged element isn't in the inner result on the first
        // frame (e.g. switchToStateAndFollow created it in a new state
        // that the inner spec doesn't know about). Fall back to
        // rendering the start state to extract the float element.
        const startLayered = renderDraggableInert(
          ctx.draggable,
          ctx.startState,
          draggedId,
          false,
        );
        const { extracted } = layeredExtract(startLayered, draggedId);
        cachedFloatLayered = extracted;
        const startDraggedElement = startLayered.byId.get(draggedId);
        cachedFloatPos = startDraggedElement
          ? localToGlobal(startDraggedElement.props.transform, ctx.pointerLocal)
          : Vec2(0, 0);
        startFloatPos = ctx.pointerStart;
      }
      floatLayered = cachedFloatLayered;
      floatPos = cachedFloatPos!;
      backdrop = layered;
    } else {
      const { remaining, extracted } = layeredExtract(layered, draggedId);
      floatLayered = extracted;
      floatPos = elementPos;
      cachedFloatLayered = extracted;
      cachedFloatPos = floatPos;
      if (startFloatPos === null) startFloatPos = ctx.pointerStart;

      if (spec.ghost !== undefined) {
        backdrop = layeredMerge(
          remaining,
          layeredSetAttributes(
            layeredPrefixIds(extracted, "ghost-"),
            spec.ghost,
          ),
        );
      } else {
        backdrop = remaining;
      }
    }

    // Compute float translation. With tether, we limit how far the
    // float can deviate from the inner spec's element position.
    let floatDelta = frame.pointer.sub(ctx.pointerStart);
    if (spec.tether) {
      const v = frame.pointer.sub(elementPos);
      const dist = v.len();
      if (dist > 1e-6) {
        const newDist = spec.tether(dist);
        const adjusted = elementPos.add(v.mul(newDist / dist));
        floatDelta = adjusted.sub(ctx.pointerStart);
      }
    }

    // Correct for the element being at its inner-result position
    // rather than the start-of-drag position.
    const posCorrection = startFloatPos!.sub(floatPos);
    const floatPositioned = layeredTransform(
      floatLayered,
      translate(floatDelta.add(posCorrection)),
    );
    const rendered = layeredMerge(
      backdrop,
      pipe(
        floatPositioned,
        (h) => layeredSetAttributes(h, { dragologyTransition: false }),
        (h) => layeredShiftZIndices(h, 1000000),
      ),
    );
    return {
      rendered,
      dropState: innerResult.dropState,
      gap: innerResult.gap,
      activePath: `with-floating/${innerResult.activePath}`,
      tracedSpec: setTraceInfo(
        { ...spec, inner: innerResult.tracedSpec },
        { outputRendered: rendered, elementPos },
      ),
    };
  };
}

function closestBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "closest" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  let fixedResult: DragResult<T> | undefined;
  if (spec.specs.length === 0) {
    // TODO: Weird special case: just stay on the starting state.
    // This is actually useful – it lets you do things like
    // d.closest(specs).whenFar(specFar) and not worry about the
    // 0-specs case. But it's not especially principled.
    fixedResult = {
      rendered: renderStateReadOnly(ctx, ctx.startState),
      dropState: ctx.startState,
      gap: Infinity,
      activePath: "closest/none",
      tracedSpec: spec,
    };
  }

  const subBehaviors = spec.specs.map((s) => dragSpecToBehavior(s, ctx));

  // This is actual memory!
  let lastBestIndex: number | null = null;

  return (frame) => {
    if (fixedResult) {
      return fixedResult;
    }

    const subResults = subBehaviors.map((b) => b(frame));
    const [bestIndex, best] = _.minBy(
      Array.from(subResults.entries()),
      ([idx, r]) => r.gap - (idx === lastBestIndex ? spec.stickiness : 0),
    )!;
    lastBestIndex = bestIndex;
    return {
      ...best,
      activePath: `closest/${bestIndex}/${best.activePath}`,
      tracedSpec: setTraceInfo(
        { ...spec, specs: subResults.map((r) => r.tracedSpec) },
        { bestIndex },
      ),
    };
  };
}

function whenFarBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "when-far" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const foregroundBehavior = dragSpecToBehavior(spec.foreground, ctx);
  const backdropBehavior = dragSpecToBehavior(spec.background, ctx);
  return (frame) => {
    const foregroundResult = foregroundBehavior(frame);
    const inForeground = foregroundResult.gap <= spec.gap;
    if (!inForeground) {
      const bgResult = backdropBehavior(frame);
      return {
        ...bgResult,
        activePath: `bg/${bgResult.activePath}`,
        tracedSpec: setTraceInfo(
          {
            ...spec,
            foreground: foregroundResult.tracedSpec,
            background: bgResult.tracedSpec,
          },
          { inForeground: false },
        ),
      };
    }
    return {
      ...foregroundResult,
      activePath: `fg/${foregroundResult.activePath}`,
      tracedSpec: setTraceInfo(
        { ...spec, foreground: foregroundResult.tracedSpec },
        { inForeground: true },
      ),
    };
  };
}

function onDropBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "on-drop" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  return changeResultBehaviorBase(spec, ctx, (result) => ({
    dropState:
      typeof spec.onDropState === "function"
        ? (spec.onDropState as (s: T) => T)(result.dropState)
        : spec.onDropState,
  }));
}

function duringBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "during" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const subBehavior = dragSpecToBehavior(spec.inner, ctx);
  return (frame) => {
    const result = subBehavior(frame);
    const transformedState = spec.duringFn(result.dropState);
    const rendered = renderStateReadOnly(ctx, transformedState);
    const elementPos = getElementPosition(ctx, rendered);
    return {
      ...result,
      rendered,
      dropState: transformedState,
      gap: frame.pointer.dist(elementPos),
      activePath: `during/${result.activePath}`,
      tracedSpec: setTraceInfo(
        { ...spec, inner: result.tracedSpec },
        { outputRendered: rendered },
      ),
    };
  };
}

function varyBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "vary" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const stateFromParams = (params: number[]): T => {
    let s = spec.state;
    for (let i = 0; i < spec.paramPaths.length; i++) {
      s = setAtPath(s, spec.paramPaths[i], params[i]);
    }
    return s;
  };

  // Compute the element position for a given set of params
  const getElementPos = (params: number[]): Vec2 => {
    const candidateState = stateFromParams(params);
    const content = renderDraggableInertUnlayered(
      ctx.draggable,
      candidateState,
      ctx.draggedId,
      true,
    );
    const found = findByPath(ctx.draggedPath, content);
    if (!found) return Vec2(Infinity, Infinity);
    return localToGlobal(found.accumulatedTransform, ctx.pointerLocal);
  };

  const { constraint, pin } = spec.options;

  // Bake pins into the constraint function: evaluate pin at the
  // initial state to capture targets, then add equal() constraints.
  const pinTargets = pin ? manyReaderToArray(pin, spec.state) : undefined;
  const constraintWithPin: ManyReader<number, T> = pin
    ? [
        constraint,
        (s) => {
          const pinCurrent = manyReaderToArray(pin, s);
          return pinCurrent.map((v, i) => [
            v - pinTargets![i],
            pinTargets![i] - v,
          ]);
        },
      ]
    : constraint;

  // Pre-compute constraint count (flatten a dummy call to count entries)
  const numConstraints = constraintWithPin
    ? manyReaderToArray(constraintWithPin, spec.state).length
    : 0;

  const initialParams = spec.paramPaths.map((path) =>
    getAtPath(spec.state, path),
  );
  const minimizer = new DistanceMinimizer(initialParams, numConstraints);

  const constraintsFn = constraintWithPin
    ? (params: number[]) =>
        manyReaderToArray(constraintWithPin, stateFromParams(params))
    : undefined;

  return (frame) => {
    const resultParams = minimizer.minimize(frame.pointer, getElementPos, {
      constraints: constraintsFn,
    });

    const newState = stateFromParams(resultParams);
    const rendered = renderStateReadOnly(ctx, newState);
    const achievedPos = getElementPosition(ctx, rendered);
    const gap = achievedPos.dist(frame.pointer);
    return {
      rendered,
      dropState: newState,
      gap,
      activePath: "vary",
      tracedSpec: setTraceInfo(spec, {
        renderedStates: [{ layered: rendered, position: achievedPos }],
        currentParams: resultParams.slice(),
      }),
    };
  };
}

function changeResultBehaviorBase<T extends object>(
  spec: DragSpecData<T> & { inner: DragSpecData<T> },
  ctx: DragBehaviorInitContext<T>,
  f: Reader<Partial<DragResult<T>>, DragResult<T>>,
): DragBehavior<T> {
  const subBehavior = dragSpecToBehavior(spec.inner, ctx);
  return (frame) => {
    const result = subBehavior(frame);
    const changed = readerToValue(f, result);
    return {
      ...result,
      activePath: `${spec.type}/${result.activePath}`,
      tracedSpec: { ...spec, inner: result.tracedSpec },
      ...changed,
    };
  };
}

function changeResultBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "change-result" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  return changeResultBehaviorBase(spec, ctx, spec.f);
}

function changeGapBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "change-gap" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  return changeResultBehaviorBase(spec, ctx, (result) => ({
    gap: spec.f(result.gap),
  }));
}

function withSnapRadiusBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "with-snap-radius" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const subBehavior = dragSpecToBehavior(spec.inner, ctx);
  const radiusSq = spec.radius ** 2;
  // Cache drop-state renders by reference identity — for `between` sub-behaviors
  // the drop state cycles through a small fixed set, so this avoids redundant
  // full render passes on every frame.
  const dropRenderedCache = new Map<T, LayeredSvgx>();
  const getDropRendered = (state: T): LayeredSvgx => {
    let cached = dropRenderedCache.get(state);
    if (!cached) {
      cached = renderStateReadOnly(ctx, state);
      dropRenderedCache.set(state, cached);
    }
    return cached;
  };
  return (frame) => {
    const result = subBehavior(frame);
    const elementPos = getElementPosition(ctx, result.rendered);
    const dropRendered = getDropRendered(result.dropState);
    const dropElementPos = getElementPosition(ctx, dropRendered);
    let rendered = result.rendered;
    const snapped = dropElementPos.dist2(elementPos) <= radiusSq;
    if (snapped) {
      rendered = dropRendered;
    }
    const snapSegment = spec.transition && snapped ? "snapped" : "unsnapped";
    const activePath = `with-snap-radius/${snapSegment}/${result.activePath}`;
    return {
      ...result,
      rendered,
      activePath,
      activePathTransition: spec.transition || undefined,
      chainNow: spec.chain && snapped ? {} : undefined,
      tracedSpec: setTraceInfo(
        { ...spec, inner: result.tracedSpec },
        { snapped, outputRendered: rendered },
      ),
    };
  };
}

function withDropTransitionBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "with-drop-transition" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  return changeResultBehaviorBase(spec, ctx, {
    dropTransition: spec.transition,
  });
}

function withBranchTransitionBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "with-branch-transition" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  return changeResultBehaviorBase(spec, ctx, {
    activePathTransition: spec.transition,
  });
}

function betweenBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "between" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const allFixed = spec.specs.every((s) => s.type === "fixed");

  if (allFixed) {
    return betweenFixedBehavior(spec, ctx);
  } else {
    return betweenDynamicBehavior(spec, ctx);
  }
}

function betweenMakeDelaunay<T extends object>(
  renderedStates: { state: T; layered: LayeredSvgx; position: Vec2 }[],
  ctx: DragBehaviorInitContext<T>,
) {
  try {
    return new Delaunay(renderedStates.map((rs) => rs.position));
  } catch (e) {
    if (e instanceof CoincidentPointsError) {
      throw new ErrorWithJSX(
        "Coincident targets detected in d.between",
        <>
          <p style={{ marginBottom: 8 }}>
            In order to use{" "}
            <span style={{ fontFamily: "monospace" }}>d.between</span>, the
            dragged element must move to distinct locations in the different
            states provided.
          </p>
          <p style={{ marginBottom: 8 }}>
            Here, we are dragging element{" "}
            <span style={{ fontFamily: "monospace" }}>{ctx.draggedPath}</span>.
            Two states put it at the point [
            {renderedStates[e.indexA].position.str(", ")}]:
          </p>
          <div style={{ marginBottom: 8 }}>
            <PrettyPrint value={renderedStates[e.indexA].state} />
            <PrettyPrint value={renderedStates[e.indexB].state} />
          </div>
          <p>
            (This is just the first pair of overlaps – other states may also
            cause overlap.)
          </p>
        </>,
      );
    }
    throw new Error(`Failed to create Delaunay triangulation: ${e}`);
  }
}

function betweenProjectAndRender<T extends object>(
  renderedStates: { state: T; layered: LayeredSvgx; position: Vec2 }[],
  delaunay: Delaunay,
  frame: DragFrame,
  spec: DragSpecData<T> & { type: "between" },
): DragResult<T> {
  const projection = delaunay.projectOntoConvexHull(frame.pointer);
  const delaunayTriangles = delaunay.triangles();

  const interpolation = spec.interpolation ?? "delaunay";
  let weights;
  if (interpolation === "natural-neighbor") {
    weights = naturalNeighborWeights(delaunay, frame, projection);
  } else if (interpolation === "delaunay") {
    weights = delaunayWeights(projection);
  } else {
    assertNever(interpolation);
  }

  const rendered = lerpLayeredWeighted(
    renderedStates.map((rs) => rs.layered),
    weights,
  );

  // Drop state: closest rendered state by pointer distance
  const closest = _.minBy(renderedStates, (rs) =>
    rs.position.dist(frame.pointer),
  )!;
  const closestIndex = renderedStates.indexOf(closest);

  return {
    rendered,
    dropState: closest.state,
    gap: projection.dist,
    activePath: "between",
    tracedSpec: setTraceInfo(spec, {
      renderedStates: renderedStates.map((rs) => ({
        layered: rs.layered,
        position: rs.position,
      })),
      closestIndex,
      outputRendered: rendered,
      delaunayTriangles,
      projectedPoint: projection.projectedPt,
      weights,
    }),
  };
}

/** Compute NNI weights, falling back to Delaunay projection weights. */
function naturalNeighborWeights(
  delaunay: Delaunay,
  frame: DragFrame,
  projection: ConvexHullProjection,
): Map<number, number> {
  const nniResult = naturalNeighborWeightsFromDelaunay(
    delaunay,
    frame.pointer,
    { projectOutside: true },
  );

  if (nniResult) {
    return nniResult.weights;
  }

  // NNI needs ≥3 points; fall back to Delaunay projection for 1–2 points
  return delaunayWeights(projection);
}

/** Extract interpolation weights from a Delaunay projection result. */
function delaunayWeights(
  projection: ConvexHullProjection,
): Map<number, number> {
  const weights = new Map<number, number>();
  if (projection.type === "vertex") {
    weights.set(projection.ptIdx, 1);
  } else if (projection.type === "edge") {
    weights.set(projection.ptIdx0, 1 - projection.t);
    weights.set(projection.ptIdx1, projection.t);
  } else {
    const { l0, l1, l2 } = projection.barycentric;
    weights.set(projection.ptIdx0, l0);
    weights.set(projection.ptIdx1, l1);
    weights.set(projection.ptIdx2, l2);
  }
  return weights;
}

function betweenFixedBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "between" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const renderedStates = spec.specs.map((s) => {
    assert(s.type === "fixed");
    const state = s.state;
    const layered = renderStateReadOnly(ctx, state);
    return { state, layered, position: getElementPosition(ctx, layered) };
  });
  const delaunay = betweenMakeDelaunay(renderedStates, ctx);

  return (frame) =>
    betweenProjectAndRender(renderedStates, delaunay, frame, spec);
}

function betweenDynamicBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "between" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const subBehaviors = spec.specs.map((s) => dragSpecToBehavior(s, ctx));

  return (frame) => {
    const subResults = subBehaviors.map((b) => b(frame));
    const renderedStates = subResults.map((result) => {
      const position = getElementPosition(ctx, result.rendered);
      return { state: result.dropState, layered: result.rendered, position };
    });
    const tracedSpec = {
      ...spec,
      specs: subResults.map((r) => r.tracedSpec),
    };
    const delaunay = betweenMakeDelaunay(renderedStates, ctx);
    return betweenProjectAndRender(renderedStates, delaunay, frame, tracedSpec);
  };
}

function switchToStateAndFollowBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "switch-to-state-and-follow" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const floatCtx = spec.draggedId
    ? extractFloatContext(
        ctx.draggable,
        spec.state,
        spec.draggedId,
        ctx.pointerLocal,
      )
    : null;

  let followSpec = spec.followSpec;
  if (!followSpec && spec.draggedId) {
    // TODO: this is kinda questionable and/or redundant

    const content = renderDraggableInertUnlayered(
      ctx.draggable,
      spec.state,
      spec.draggedId,
      true,
    );
    const found = findElement(content, (el) => el.props.id === spec.draggedId);
    assert(
      !!found,
      `switchToStateAndFollow: element "${spec.draggedId}" not found`,
    );
    const callback = getDragSpecCallbackOnElement<T>(found.element);
    assert(
      !!callback,
      `switchToStateAndFollow: no followSpec and no dragology on "${spec.draggedId}"`,
    );
    followSpec = callback();
  }
  assert(!!followSpec, "switchToStateAndFollow: no followSpec");

  const subBehavior = dragSpecToBehavior(followSpec, {
    ...ctx,
    startState: spec.state,
    draggedId: spec.draggedId,
    draggedPath: spec.draggedId + "/",
    pointerStart: floatCtx?.pointerStart ?? ctx.pointerStart,
  });
  return (frame) => {
    const innerResult = subBehavior(frame);
    return {
      ...innerResult,
      activePath: `switch-to-state-and-follow/${innerResult.activePath}`,
      tracedSpec: setTraceInfo(spec, {
        tracedInner: innerResult.tracedSpec,
      }),
    };
  };
}

function dropTargetBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "drop-target" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const rendered = renderStateReadOnly(ctx, spec.state);
  const targetElement = rendered.byId.get(spec.targetId);
  assert(
    targetElement !== undefined,
    `dropTarget: element with id "${spec.targetId}" not found in rendered state`,
  );
  const transforms = parseTransform(targetElement.props.transform);
  const localBounds = getLocalBounds(targetElement);
  assert(
    localBounds !== null,
    `dropTarget: could not compute bounds for element "${spec.targetId}"`,
  );
  // Pre-compute global bounds corners for debug overlay
  const globalCorners = [
    localToGlobal(transforms, Vec2(localBounds.minX, localBounds.minY)),
    localToGlobal(transforms, Vec2(localBounds.maxX, localBounds.minY)),
    localToGlobal(transforms, Vec2(localBounds.maxX, localBounds.maxY)),
    localToGlobal(transforms, Vec2(localBounds.minX, localBounds.maxY)),
  ];
  return (frame) => {
    const localPointer = globalToLocal(transforms, frame.pointer);
    const inside = pointInBounds(localPointer, localBounds);
    const gap = inside ? 0 : Infinity;
    return {
      rendered,
      dropState: spec.state,
      gap,
      activePath: "drop-target",
      tracedSpec: setTraceInfo(spec, {
        renderedStates: [{ layered: rendered, position: Vec2(0, 0) }],
        inside,
        globalCorners,
      }),
    };
  };
}

function withChainingBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "with-chaining" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  return changeResultBehaviorBase(spec, ctx, (result) => ({
    chainNow: result.chainNow ?? spec.chaining,
  }));
}

function substateBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "substate" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const { state, path, innerSpec } = spec;

  const lensedDraggable: Draggable<any> = (props) =>
    ctx.draggable(
      makeDraggableProps({
        state: setAtPath(state, path as any, props.state),
        draggedId: props.draggedId,
        setState: props.setState,
        isTracking: props.isTracking,
      }),
    );

  const innerBehavior = dragSpecToBehavior(innerSpec, {
    ...ctx,
    draggable: lensedDraggable,
  });

  return (frame) => {
    const result = innerBehavior(frame);
    return {
      ...result,
      dropState: setAtPath(state, path as any, result.dropState),
      tracedSpec: setTraceInfo(
        {
          ...spec,
          innerSpec: result.tracedSpec as DragSpecData<unknown>,
        } as DragSpecData<T>,
        {},
      ),
    };
  };
}

function reactToBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "react-to" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const { iterator, callback } = spec;

  // initialize with fresh object so it will be invalidated
  let lastValue: unknown = {};
  let innerBehavior: DragBehavior<T>;
  let changeCount = 0;

  return (frame) => {
    const value = iterator.next().value;
    if (value !== lastValue) {
      lastValue = value;
      changeCount++;
      innerBehavior = dragSpecToBehavior(callback(value), ctx);
    }
    const result = innerBehavior(frame);
    return {
      ...result,
      activePath: `react-to/${result.activePath}`,
      tracedSpec: setTraceInfo(spec, {
        currentValue: lastValue,
        changeCount,
        tracedInner: result.tracedSpec,
      }),
    };
  };
}

function withInitContextBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "with-init-context" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const newCtx = spec.f(ctx);
  const subBehavior = dragSpecToBehavior(spec.inner, newCtx);
  return (frame) => {
    const result = subBehavior(frame);
    return {
      ...result,
      activePath: `with-init-context/${result.activePath}`,
      tracedSpec: { ...spec, inner: result.tracedSpec },
    };
  };
}

// # Shared helpers

function renderStateReadOnly<T extends object>(
  ctx: DragBehaviorInitContext<T>,
  state: T,
): LayeredSvgx {
  // TODO: be more discriminating about whether isTracking should be
  // false here
  return renderDraggableInert(ctx.draggable, state, ctx.draggedId, false);
}

function getElementPosition<T extends object>(
  ctx: DragBehaviorInitContext<T>,
  layered: LayeredSvgx,
): Vec2 {
  const found = findByPathInLayered(ctx.draggedPath, layered);
  if (!found) return Vec2(Infinity, Infinity);
  return localToGlobal(found.accumulatedTransform, ctx.pointerLocal);
}
