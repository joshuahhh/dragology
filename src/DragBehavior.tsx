import { PrettyPrint } from "@joshuahhh/pretty-print";
import _ from "lodash";
import { Draggable, makeDraggableProps } from "./draggable";
import { Chaining, DragSpecData } from "./DragSpec";
import { setTraceInfo } from "./DragSpecTraceInfo";
import { ErrorWithJSX } from "./ErrorBoundary";
import { CoincidentPointsError, Delaunay } from "./math/delaunay";
import { DistanceMinimizer } from "./math/optimization";
import { Vec2 } from "./math/vec2";
import { getAtPath, setAtPath } from "./paths";
import {
  renderDraggableInert,
  renderDraggableInertUnlayered,
} from "./renderDraggable";
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
import { lerpLayered, lerpLayered3 } from "./svgx/lerp";
import { findByPath } from "./svgx/path";
import { globalToLocal, localToGlobal, parseTransform } from "./svgx/transform";
import { Transition } from "./transition";
import {
  assert,
  assertNever,
  ManyReader,
  manyReaderToArray,
  pipe,
} from "./utils";

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
  pointerStart: Vec2;
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
  distance: number;
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
    case "change-distance":
      return changeDistanceBehavior(spec, ctx);
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
    const distance = frame.pointer.dist(elementPos);
    return {
      rendered,
      dropState: spec.state,
      distance,
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
      assert(
        cachedFloatLayered !== null,
        "Floating drag: dragged element never appeared in inner result",
      );
      floatLayered = cachedFloatLayered;
      floatPos = cachedFloatPos!;
      backdrop = layered;
    } else {
      const { remaining, extracted } = layeredExtract(layered, draggedId);
      floatLayered = extracted;
      floatPos = elementPos;
      cachedFloatLayered = extracted;
      cachedFloatPos = floatPos;
      if (startFloatPos === null) startFloatPos = floatPos;

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
    let floatDelta = frame.pointer.sub(frame.pointerStart);
    if (spec.tether) {
      const v = frame.pointer.sub(elementPos);
      const dist = v.len();
      if (dist > 1e-6) {
        const newDist = spec.tether(dist);
        const adjusted = elementPos.add(v.mul(newDist / dist));
        floatDelta = adjusted.sub(frame.pointerStart);
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
        (h) => layeredSetAttributes(h, { "data-transition": false }),
        (h) => layeredShiftZIndices(h, 1000000),
      ),
    );
    return {
      rendered,
      dropState: innerResult.dropState,
      distance: innerResult.distance,
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
  const subBehaviors = spec.specs.map((s) => dragSpecToBehavior(s, ctx));
  return (frame) => {
    const subResults = subBehaviors.map((b) => b(frame));
    const best = _.minBy(subResults, (r) => r.distance)!;
    const bestIdx = subResults.indexOf(best);
    return {
      ...best,
      activePath: `closest/${bestIdx}/${best.activePath}`,
      tracedSpec: setTraceInfo(
        { ...spec, specs: subResults.map((r) => r.tracedSpec) },
        { bestIndex: bestIdx },
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
    const inForeground = foregroundResult.distance <= spec.distance;
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
  const subBehavior = dragSpecToBehavior(spec.inner, ctx);
  return (frame) => {
    const result = subBehavior(frame);
    return {
      ...result,
      dropState:
        typeof spec.onDropState === "function"
          ? (spec.onDropState as (s: T) => T)(result.dropState)
          : spec.onDropState,
      activePath: `on-drop/${result.activePath}`,
      tracedSpec: { ...spec, inner: result.tracedSpec },
    };
  };
}

function duringBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "during" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const subBehavior = dragSpecToBehavior(spec.inner, ctx);
  return (frame) => {
    const result = subBehavior(frame);
    const transformedState = spec.duringFn(result.dropState);
    // console.group("during turned");
    // prettyLog(result.dropState);
    // prettyLog(transformedState);
    // console.groupEnd();
    const rendered = renderStateReadOnly(ctx, transformedState);
    const elementPos = getElementPosition(ctx, rendered);
    return {
      ...result,
      rendered,
      dropState: transformedState,
      distance: frame.pointer.dist(elementPos),
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
    const distance = achievedPos.dist(frame.pointer);
    return {
      rendered,
      dropState: newState,
      distance,
      activePath: "vary",
      tracedSpec: setTraceInfo(spec, {
        renderedStates: [{ layered: rendered, position: achievedPos }],
        currentParams: resultParams.slice(),
      }),
    };
  };
}

function changeDistanceBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "change-distance" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const subBehavior = dragSpecToBehavior(spec.inner, ctx);
  return (frame) => {
    const result = subBehavior(frame);
    const scaledDistance = spec.f(result.distance);
    return {
      ...result,
      distance: scaledDistance,
      activePath: `change-distance/${result.activePath}`,
      tracedSpec: { ...spec, inner: result.tracedSpec },
    };
  };
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
  const subBehavior = dragSpecToBehavior(spec.inner, ctx);
  return (frame) => {
    const result = subBehavior(frame);
    return {
      ...result,
      dropTransition: spec.transition,
      activePath: `with-drop-transition/${result.activePath}`,
      tracedSpec: { ...spec, inner: result.tracedSpec },
    };
  };
}

function withBranchTransitionBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "with-branch-transition" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const subBehavior = dragSpecToBehavior(spec.inner, ctx);
  return (frame) => {
    const result = subBehavior(frame);
    return {
      ...result,
      activePathTransition: spec.transition,
      activePath: `with-branch-transition/${result.activePath}`,
      tracedSpec: { ...spec, inner: result.tracedSpec },
    };
  };
}

function betweenBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "between" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const renderedStates = spec.states.map((state) => {
    const layered = renderStateReadOnly(ctx, state);
    return { state, layered, position: getElementPosition(ctx, layered) };
  });
  let delaunay;
  try {
    delaunay = new Delaunay(renderedStates.map((rs) => rs.position));
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

  const delaunayTriangles = delaunay.triangles();

  return (frame) => {
    const projection = delaunay.projectOntoConvexHull(frame.pointer);

    let rendered: LayeredSvgx;
    if (projection.type === "vertex") {
      rendered = renderedStates[projection.ptIdx].layered;
    } else if (projection.type === "edge") {
      rendered = lerpLayered(
        renderedStates[projection.ptIdx0].layered,
        renderedStates[projection.ptIdx1].layered,
        projection.t,
      );
    } else {
      rendered = lerpLayered3(
        renderedStates[projection.ptIdx0].layered,
        renderedStates[projection.ptIdx1].layered,
        renderedStates[projection.ptIdx2].layered,
        projection.barycentric,
      );
    }

    // Drop state: closest rendered state by pointer distance
    const closest = _.minBy(renderedStates, (rs) =>
      rs.position.dist(frame.pointer),
    )!;
    const closestIndex = renderedStates.indexOf(closest);

    return {
      rendered,
      dropState: closest.state,
      distance: projection.dist,
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
      }),
    };
  };
}

function switchToStateAndFollowBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "switch-to-state-and-follow" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const rendered = renderStateReadOnly(ctx, spec.state);
  const elementPos = getElementPosition(ctx, rendered);
  return (_frame) => ({
    rendered,
    dropState: spec.state,
    distance: 0,
    activePath: "switch-to-state-and-follow",
    chainNow: { draggedId: spec.draggedId, followSpec: spec.followSpec },
    tracedSpec: setTraceInfo(spec, {
      renderedStates: [{ layered: rendered, position: elementPos }],
    }),
  });
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
    const distance = inside ? 0 : Infinity;
    return {
      rendered,
      dropState: spec.state,
      distance,
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
  const subBehavior = dragSpecToBehavior(spec.inner, ctx);
  return (frame) => {
    const result = subBehavior(frame);
    return {
      ...result,
      chainNow: result.chainNow ?? spec.chaining,
      activePath: `with-chaining/${result.activePath}`,
      tracedSpec: { ...spec, inner: result.tracedSpec },
    };
  };
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
