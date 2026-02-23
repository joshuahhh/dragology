import { PrettyPrint } from "@joshuahhh/pretty-print";
import _ from "lodash";
import { Draggable } from "./draggable";
import { Chaining, DragSpecData } from "./DragSpec";
import { ErrorWithJSX } from "./ErrorBoundary";
import { CoincidentPointsError, Delaunay } from "./math/delaunay";
import { minimize } from "./math/minimize";
import { Vec2 } from "./math/vec2";
import { getAtPath, setAtPath } from "./paths";
import {
  renderDraggableInert,
  renderDraggableInertUnlayered,
} from "./renderDraggable";
import { Svgx } from "./svgx";
import { getLocalBounds, pointInBounds } from "./svgx/bounds";
import { path as svgPath, translate } from "./svgx/helpers";
import {
  LayeredSvgx,
  findByPathInLayered,
  layeredExtract,
  layeredMerge,
  layeredPrefixIds,
  layeredSetAttributes,
  layeredShiftZIndices,
  layeredTransform,
} from "./svgx/layers";
import { lerpLayered, lerpLayered3 } from "./svgx/lerp";
import { findByPath } from "./svgx/path";
import { globalToLocal, localToGlobal, parseTransform } from "./svgx/transform";
import { Transition } from "./transition";
import { assert, assertNever, manyToArray, pipe } from "./utils";

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
   * An optional debug overlay to render on top of the drag result.
   */
  debugOverlay?: () => Svgx;
  /**
   * A decorated copy of the spec tree with per-node debug info
   * attached. Built bottom-up by each behavior.
   */
  annotatedSpec?: AnnotatedSpec<T>;
};

/**
 * A node in the annotated spec tree. Mirrors the DragSpec tree
 * structure, but each node carries debug info produced by its
 * behavior at runtime.
 */
export type AnnotatedSpec<T> = {
  /** The original spec node (for reading type, states, params, etc.) */
  spec: DragSpecData<T>;
  /** Runtime debug info — which fields are populated depends on spec.type */
  debug: SpecDebugInfo<T>;
  /** Annotated children, in order matching the spec's sub-specs */
  children: AnnotatedSpec<T>[];
};

export type SpecDebugInfo<T> = {
  /** Pre-rendered states (between, just, vary, switchToStateAndFollow, dropTarget) */
  renderedStates?: { layered: LayeredSvgx; position: Vec2 }[];
  /** The rendered output of this node, when it differs from its child's render */
  outputRendered?: LayeredSvgx;
  /** Index of the closest/chosen state (between) */
  closestIndex?: number;
  /** Index of the best child (closest) */
  bestIndex?: number;
  /** Whether we're in the foreground branch (withBackground) */
  inForeground?: boolean;
  /** Whether the snap engaged (withSnapRadius) */
  snapped?: boolean;
  /** Whether the pointer is inside the target (dropTarget) */
  inside?: boolean;
  /** Current parameter values (vary) */
  currentParams?: number[];
  /** The drop state for this node */
  dropState?: T;
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
  floatLayered: LayeredSvgx | null;
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
    case "with-background":
      return withBackgroundBehavior(spec, ctx);
    case "and-then":
      return andThenBehavior(spec, ctx);
    case "during":
      return duringBehavior(spec, ctx);
    case "vary":
      return varyBehavior(spec, ctx);
    case "with-distance":
      return withDistanceBehavior(spec, ctx);
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
  const annotatedSpec: AnnotatedSpec<T> = {
    spec,
    debug: { renderedStates: [{ layered: rendered, position: elementPos }] },
    children: [],
  };
  return (frame) => {
    const distance = frame.pointer.dist(elementPos);
    return {
      rendered,
      dropState: spec.state,
      distance,
      activePath: "fixed",
      annotatedSpec,
      debugOverlay: () => (
        <g opacity={0.8}>
          <circle
            cx={elementPos.x}
            cy={elementPos.y}
            r={4}
            fill="none"
            stroke="magenta"
            strokeWidth={1.5}
          />
          <DistanceLine
            from={elementPos}
            to={frame.pointer}
            distance={distance}
          />
        </g>
      ),
    };
  };
}

function withFloatingBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "with-floating" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const { draggedId, floatLayered } = ctx;
  assert(
    draggedId !== null,
    "Floating drags require the dragged element to have an id",
  );
  assert(floatLayered !== null, "Floating drags require floatLayered");
  const innerBehavior = dragSpecToBehavior(spec.spec, ctx);

  return (frame) => {
    const innerResult = innerBehavior(frame);
    const layered = innerResult.rendered;
    // On a layer, the transform prop IS the accumulated transform.
    const draggedElement = layered.byId.get(draggedId);
    const elementPos = draggedElement
      ? localToGlobal(draggedElement.props.transform, ctx.pointerLocal)
      : Vec2(Infinity, Infinity);
    const hasElement = layered.byId.has(draggedId);

    let backdrop: LayeredSvgx;
    if (!hasElement) {
      backdrop = layered;
    } else if (spec.ghost !== undefined) {
      const { remaining, extracted } = layeredExtract(layered, draggedId);
      backdrop = layeredMerge(
        remaining,
        layeredSetAttributes(layeredPrefixIds(extracted, "ghost-"), spec.ghost),
      );
    } else {
      backdrop = layeredExtract(layered, draggedId).remaining;
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
    const floatPositioned = layeredTransform(
      floatLayered,
      translate(floatDelta),
    );
    const rendered = layeredMerge(
      backdrop,
      pipe(
        floatPositioned,
        (h) => layeredSetAttributes(h, { "data-transition": false }),
        (h) => layeredShiftZIndices(h, 1000000),
      ),
    );
    const distance = frame.pointer.dist(elementPos);
    return {
      rendered,
      dropState: innerResult.dropState,
      distance,
      activePath: `with-floating/${innerResult.activePath}`,
      annotatedSpec: {
        spec,
        debug: { outputRendered: rendered },
        children: innerResult.annotatedSpec ? [innerResult.annotatedSpec] : [],
      },
      debugOverlay: () => (
        <g opacity={0.8}>
          <circle cx={elementPos.x} cy={elementPos.y} r={5} fill="magenta" />
          <DistanceLine
            from={elementPos}
            to={frame.pointer}
            distance={distance}
          />
        </g>
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
      annotatedSpec: {
        spec,
        debug: { bestIndex: bestIdx },
        children: subResults.flatMap((r) =>
          r.annotatedSpec ? [r.annotatedSpec] : [],
        ),
      },
      debugOverlay: () => (
        <g>
          {subResults.map((r, i) => {
            const sub = r.debugOverlay?.();
            if (!sub) return null;
            return (
              <g key={i} opacity={i === bestIdx ? 1 : 0.2}>
                {sub}
              </g>
            );
          })}
        </g>
      ),
    };
  };
}

function withBackgroundBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "with-background" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const foregroundBehavior = dragSpecToBehavior(spec.foreground, ctx);
  const backdropBehavior = dragSpecToBehavior(spec.background, ctx);
  return (frame) => {
    const foregroundResult = foregroundBehavior(frame);
    const inForeground = foregroundResult.distance <= spec.radius;
    if (!inForeground) {
      const bgResult = backdropBehavior(frame);
      const fgDebug = foregroundResult.debugOverlay;
      const bgDebug = bgResult.debugOverlay;
      return {
        ...bgResult,
        activePath: `bg/${bgResult.activePath}`,
        annotatedSpec: {
          spec,
          debug: { inForeground: false },
          children: [
            foregroundResult.annotatedSpec,
            bgResult.annotatedSpec,
          ].filter((c): c is AnnotatedSpec<T> => c != null),
        },
        debugOverlay:
          fgDebug || bgDebug
            ? () => (
                <g>
                  {fgDebug && <g opacity={0.15}>{fgDebug()}</g>}
                  {bgDebug?.()}
                </g>
              )
            : undefined,
      };
    }
    return {
      ...foregroundResult,
      activePath: `fg/${foregroundResult.activePath}`,
      annotatedSpec: {
        spec,
        debug: { inForeground: true },
        children: foregroundResult.annotatedSpec
          ? [foregroundResult.annotatedSpec]
          : [],
      },
    };
  };
}

function andThenBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "and-then" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const subBehavior = dragSpecToBehavior(spec.spec, ctx);
  return (frame) => {
    const result = subBehavior(frame);
    return {
      ...result,
      dropState:
        typeof spec.andThenState === "function"
          ? (spec.andThenState as (s: T) => T)(result.dropState)
          : spec.andThenState,
      annotatedSpec: {
        spec,
        debug: {},
        children: result.annotatedSpec ? [result.annotatedSpec] : [],
      },
    };
  };
}

function duringBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "during" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const subBehavior = dragSpecToBehavior(spec.spec, ctx);
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
      annotatedSpec: {
        spec,
        debug: { outputRendered: rendered },
        children: result.annotatedSpec ? [result.annotatedSpec] : [],
      },
    };
  };
}

function varyBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "vary" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  let curParams = spec.paramPaths.map((path) => getAtPath(spec.state, path));

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

  return (frame) => {
    const baseObjectiveFn = (params: number[]) => {
      const pos = getElementPos(params);
      return pos.dist2(frame.pointer);
    };

    const r = minimize(baseObjectiveFn, curParams);
    let resultParams = r.solution;

    // Evaluate constraint: flatten Many<number> to array, take max (most violated)
    const evalConstraint = (params: number[]): number => {
      const gs = manyToArray(spec.constraint!(stateFromParams(params)));
      return gs.length === 0 ? -Infinity : Math.max(...gs);
    };

    // If the unconstrained optimum violates the constraint (g > 0),
    // do a second optimization to find the closest feasible point.
    // Objective: max(0, g(x)) + ε·dist²
    // The max(0,g) term dominates until we reach g≤0, then the
    // distance term finds the closest feasible point to the optimum.
    if (spec.constraint && evalConstraint(resultParams) > 0) {
      const x0 = resultParams.slice();
      const pos0 = spec.constrainByRender ? getElementPos(resultParams) : null;
      const pullbackFn = (params: number[]) => {
        const g = evalConstraint(params);
        const penalty = g > 0 ? g : 0;
        let dist2: number;
        if (spec.constrainByRender) {
          // Screen-space distance (more accurate)
          const pos = getElementPos(params);
          dist2 = pos.dist2(pos0!);
        } else {
          // Parameter-space distance (faster, default)
          dist2 = 0;
          for (let i = 0; i < params.length; i++) {
            dist2 += (params[i] - x0[i]) ** 2;
          }
        }
        return penalty + 1e-4 * dist2;
      };
      const r2 = minimize(pullbackFn, resultParams);
      resultParams = r2.solution;
    }

    curParams = resultParams;
    const newState = stateFromParams(resultParams);
    const rendered = renderStateReadOnly(ctx, newState);
    const achievedPos = getElementPosition(ctx, rendered);
    const distance = Math.sqrt(baseObjectiveFn(resultParams));
    return {
      rendered,
      dropState: newState,
      distance,
      activePath: "vary",
      annotatedSpec: {
        spec,
        debug: {
          renderedStates: [{ layered: rendered, position: achievedPos }],
          currentParams: resultParams.slice(),
        },
        children: [],
      },
      debugOverlay: () => (
        <g opacity={0.8}>
          <circle {...achievedPos.cxy()} r={5} fill="magenta" />
          <DistanceLine
            from={achievedPos}
            to={frame.pointer}
            distance={distance}
          />
        </g>
      ),
    };
  };
}

function withDistanceBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "with-distance" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const subBehavior = dragSpecToBehavior(spec.spec, ctx);
  return (frame) => {
    const result = subBehavior(frame);
    const scaledDistance = spec.f(result.distance);
    return {
      ...result,
      distance: scaledDistance,
      annotatedSpec: {
        spec,
        debug: {},
        children: result.annotatedSpec ? [result.annotatedSpec] : [],
      },
    };
  };
}

function withSnapRadiusBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "with-snap-radius" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const subBehavior = dragSpecToBehavior(spec.spec, ctx);
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
    const activePath =
      spec.transition && snapped
        ? `with-snap-radius[snapped]/${result.activePath}`
        : `with-snap-radius/${result.activePath}`;
    return {
      ...result,
      rendered,
      activePath,
      activePathTransition: spec.transition || undefined,
      chainNow: spec.chain && snapped ? {} : undefined,
      annotatedSpec: {
        spec,
        debug: { snapped, outputRendered: rendered },
        children: result.annotatedSpec ? [result.annotatedSpec] : [],
      },
    };
  };
}

function withDropTransitionBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "with-drop-transition" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const subBehavior = dragSpecToBehavior(spec.spec, ctx);
  return (frame) => {
    const result = subBehavior(frame);
    return {
      ...result,
      dropTransition: spec.transition,
      activePath: `with-drop-transition/${result.activePath}`,
      annotatedSpec: {
        spec,
        debug: {},
        children: result.annotatedSpec ? [result.annotatedSpec] : [],
      },
    };
  };
}

function withBranchTransitionBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "with-branch-transition" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const subBehavior = dragSpecToBehavior(spec.spec, ctx);
  return (frame) => {
    const result = subBehavior(frame);
    return {
      ...result,
      activePathTransition: spec.transition,
      activePath: `with-branch-transition/${result.activePath}`,
      annotatedSpec: {
        spec,
        debug: {},
        children: result.annotatedSpec ? [result.annotatedSpec] : [],
      },
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
          <p className="mb-2">
            In order to use <span className="font-mono">d.between</span>, the
            dragged element must move to distinct locations in the different
            states provided.
          </p>
          <p className="mb-2">
            Here, we are dragging element{" "}
            <span className="font-mono">{ctx.draggedPath}</span>. Two states put
            it at the point [{renderedStates[e.indexA].position.str(", ")}]:
          </p>
          <div className="mb-2">
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
      annotatedSpec: {
        spec,
        debug: {
          renderedStates: renderedStates.map((rs) => ({
            layered: rs.layered,
            position: rs.position,
          })),
          closestIndex,
          outputRendered: rendered,
        },
        children: [],
      },
      debugOverlay: () => (
        <g>
          {/* Delaunay triangulation edges */}
          {delaunay.triangles().map((tri, i) => {
            const [a, b, c] = tri;
            return (
              <path
                key={`tri-${i}`}
                d={svgPath("M", a.x, a.y, "L", b.x, b.y, "L", c.x, c.y, "Z")}
                stroke="magenta"
                strokeWidth={1}
                fill="magenta"
                fillOpacity={0.05}
              />
            );
          })}
          {/* State positions */}
          {renderedStates.map((rs, i) => (
            <circle
              key={`pt-${i}`}
              {...rs.position.cxy()}
              r={6}
              fill={i === closestIndex ? "magenta" : "none"}
              stroke="magenta"
              strokeWidth={1.5}
              opacity={i === closestIndex ? 1 : 0.5}
            />
          ))}
          {/* Projected point */}
          <circle
            {...projection.projectedPt.cxy()}
            r={5}
            stroke="magenta"
            strokeWidth={2}
            fill="none"
          />
          <DistanceLine
            from={frame.pointer}
            to={projection.projectedPt}
            distance={projection.dist}
          />
        </g>
      ),
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
    annotatedSpec: {
      spec,
      debug: { renderedStates: [{ layered: rendered, position: elementPos }] },
      children: [],
    },
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
      annotatedSpec: {
        spec,
        debug: {
          renderedStates: [{ layered: rendered, position: Vec2(0, 0) }],
          inside,
        },
        children: [],
      },
      debugOverlay: () => (
        <g opacity={0.8}>
          <polygon
            points={globalCorners.map((c) => `${c.x},${c.y}`).join(" ")}
            fill={inside ? "magenta" : "none"}
            fillOpacity={0.15}
            stroke="magenta"
            strokeWidth={1.5}
            strokeDasharray={inside ? undefined : "4 3"}
          />
        </g>
      ),
    };
  };
}

function withChainingBehavior<T extends object>(
  spec: DragSpecData<T> & { type: "with-chaining" },
  ctx: DragBehaviorInitContext<T>,
): DragBehavior<T> {
  const subBehavior = dragSpecToBehavior(spec.spec, ctx);
  return (frame) => {
    const result = subBehavior(frame);
    return {
      ...result,
      chainNow: result.chainNow ?? spec.chaining,
      activePath: `with-chaining/${result.activePath}`,
      annotatedSpec: {
        spec,
        debug: {},
        children: result.annotatedSpec ? [result.annotatedSpec] : [],
      },
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

function DistanceLine({
  from,
  to,
  distance,
}: {
  from: Vec2;
  to: Vec2;
  distance: number;
}) {
  const label = `${Math.round(distance)}px`;
  return (
    <g>
      <line
        {...from.xy1()}
        {...to.xy2()}
        stroke="white"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <line
        {...from.xy1()}
        {...to.xy2()}
        stroke="magenta"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <text
        {...from.lerp(to, 0.5).xy()}
        fill="magenta"
        stroke="white"
        strokeWidth={3}
        paintOrder="stroke"
        fontSize={11}
        fontFamily="monospace"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label}
      </text>
    </g>
  );
}
