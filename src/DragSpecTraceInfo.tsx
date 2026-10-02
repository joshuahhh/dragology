import { DragSpecData } from "./DragSpec";
import { Vec2 } from "./math/vec2";
import { Bounds } from "./svgx/bounds";
import { LayeredSvgx } from "./svgx/layers";

export type RenderedState = { layered: LayeredSvgx; position: Vec2 };

/**
 * Maps DragSpec variants' `type` discriminants to their trace info
 * shapes. Variants with no trace info can be left out (see
 * `DragSpecTraceInfo`).
 */
export type DragSpecTraceInfoByType = {
  fixed: { outputPreview: LayeredSvgx; position: Vec2 | null };
  withFloating: {
    outputPreview?: LayeredSvgx;
    /**
     * Where the element is floated FROM. Will be null if the element
     * is not found (is floating from memory), or undefined if the
     * preview hasn't been computed yet (lazy evaluation).
     */
    elementPos?: Vec2 | null;
  };
  closest: { bestIndex: number; locked: boolean };
  whenFar: { inForeground: boolean };
  during: { outputPreview: LayeredSvgx };
  vary: {
    renderedStates: RenderedState[];
    currentParams: number[];
    exploredPositions?: Vec2[];
  };
  varyFunc: {
    renderedStates: RenderedState[];
    currentParams: number[];
    exploredPositions?: Vec2[];
  };
  withSnapRadius: {
    snapped: boolean;
    outputPreview: LayeredSvgx;
  };
  between: {
    renderedStates: RenderedState[];
    closestIndex: number;
    outputPreview: LayeredSvgx;
    delaunayTriangles: Vec2[][];
    projectedPoint: Vec2;
    /** Index → weight for each state contributing to the interpolation. */
    weights: Map<number, number>;
  };
  switchToStateAndFollow: {
    tracedInner: DragSpecData<any>;
  };
  dropTarget: {
    renderedStates: RenderedState[];
    inside: boolean;
    globalBounds: Bounds;
  };
  reactTo: {
    currentValue: unknown;
    changeCount: number;
    tracedInner: DragSpecData<any>;
  };
};

/** Trace info shape for a spec type; empty if it isn't listed above. */
export type DragSpecTraceInfo<K extends DragSpecData<any>["type"]> =
  K extends keyof DragSpecTraceInfoByType
    ? DragSpecTraceInfoByType[K]
    : Record<string, never>;

/** Get typed trace info from a spec node, or undefined if not annotated. */
export function getTraceInfo<S extends DragSpecData<any>>(
  spec: S,
): DragSpecTraceInfo<S["type"]> | undefined {
  return spec.traceInfo as DragSpecTraceInfo<S["type"]> | undefined;
}

/** Return a copy of the spec with typed trace info attached. */
export function setTraceInfo<S extends DragSpecData<any>>(
  spec: S,
  traceInfo: DragSpecTraceInfo<S["type"]>,
): S {
  return { ...spec, traceInfo };
}
