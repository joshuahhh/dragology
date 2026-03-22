import { DragSpecData } from "./DragSpec";
import { Vec2 } from "./math/vec2";
import { Bounds } from "./svgx/bounds";
import { LayeredSvgx } from "./svgx/layers";

export type RenderedState = { layered: LayeredSvgx; position: Vec2 };

/**
 * Maps each DragSpec variant's `type` discriminant to its trace info
 * shape.
 */
export type DragSpecTraceInfoByType = {
  fixed: { renderedStates: RenderedState[] };
  "with-floating": { outputPreview: LayeredSvgx; elementPos: Vec2 };
  closest: { bestIndex: number };
  "when-far": { inForeground: boolean };
  "on-drop": Record<string, never>;
  during: { outputPreview: LayeredSvgx };
  vary: { renderedStates: RenderedState[]; currentParams: number[] };
  "change-result": Record<string, never>;
  "change-gap": Record<string, never>;
  "with-snap-radius": {
    snapped: boolean;
    outputPreview: LayeredSvgx;
  };
  "with-drop-transition": Record<string, never>;
  "with-branch-transition": Record<string, never>;
  between: {
    renderedStates: RenderedState[];
    closestIndex: number;
    outputPreview: LayeredSvgx;
    delaunayTriangles: Vec2[][];
    projectedPoint: Vec2;
    /** Index → weight for each state contributing to the interpolation. */
    weights: Map<number, number>;
  };
  "switch-to-state-and-follow": {
    tracedInner: DragSpecData<any>;
  };
  "drop-target": {
    renderedStates: RenderedState[];
    inside: boolean;
    globalBounds: Bounds;
  };
  "with-chaining": Record<string, never>;
  substate: Record<string, never>;
  "react-to": {
    currentValue: unknown;
    changeCount: number;
    tracedInner: DragSpecData<any>;
  };
  "with-init-context": Record<string, never>;
};

/** Get typed trace info from a spec node, or undefined if not annotated. */
export function getTraceInfo<S extends DragSpecData<any>>(
  spec: S,
): DragSpecTraceInfoByType[S["type"]] | undefined {
  return spec.traceInfo as DragSpecTraceInfoByType[S["type"]] | undefined;
}

/** Return a copy of the spec with typed trace info attached. */
export function setTraceInfo<S extends DragSpecData<any>>(
  spec: S,
  traceInfo: DragSpecTraceInfoByType[S["type"]],
): S {
  return { ...spec, traceInfo };
}
