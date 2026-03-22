import { DragSpecData } from "./DragSpec";
import { Vec2 } from "./math/vec2";
import { Svgx } from "./svgx";
import { Bounds, boundsCenter } from "./svgx/bounds";
import { path as svgPath } from "./svgx/helpers";
import { LayeredSvgx } from "./svgx/layers";
import { assertNever } from "./utils/assert";

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

/** Compute the debug overlay SVG from a traced spec tree + pointer position. */
export function debugOverlay<T extends object>(
  spec: DragSpecData<T>,
  pointer: Vec2,
  active = true,
): Svgx | null {
  const opacity = active ? 0.8 : 0.2;
  switch (spec.type) {
    case "fixed": {
      const info = getTraceInfo(spec);
      if (!info) return null;
      const pos = info.renderedStates[0].position;
      const distance = pointer.dist(pos);
      return (
        <g opacity={opacity}>
          <circle
            cx={pos.x}
            cy={pos.y}
            r={4}
            fill="none"
            stroke="magenta"
            strokeWidth={1.5}
          />
          <DistanceLine from={pos} to={pointer} distance={distance} />
        </g>
      );
    }

    case "with-floating": {
      const info = getTraceInfo(spec);
      if (!info) return null;
      const innerOverlay = debugOverlay(spec.inner, pointer, active);
      const distance = pointer.dist(info.elementPos);
      return (
        <g>
          {innerOverlay}
          <g opacity={opacity}>
            <circle
              cx={info.elementPos.x}
              cy={info.elementPos.y}
              r={5}
              fill="magenta"
            />
            <DistanceLine
              from={info.elementPos}
              to={pointer}
              distance={distance}
            />
          </g>
        </g>
      );
    }

    case "closest": {
      const info = getTraceInfo(spec);
      if (!info) return null;
      return (
        <g>
          {spec.specs.map((child, i) => {
            const sub = debugOverlay(
              child,
              pointer,
              active && i === info.bestIndex,
            );
            if (!sub) return null;
            return <g key={i}>{sub}</g>;
          })}
        </g>
      );
    }

    case "when-far": {
      const info = getTraceInfo(spec);
      if (!info) return null;
      const fgOverlay = debugOverlay(
        spec.foreground,
        pointer,
        active && info.inForeground,
      );
      if (info.inForeground) {
        return fgOverlay;
      }
      const bgOverlay = debugOverlay(spec.background, pointer, active);
      if (!fgOverlay && !bgOverlay) return null;
      return (
        <g>
          {fgOverlay}
          {bgOverlay}
        </g>
      );
    }

    case "between": {
      const info = getTraceInfo(spec);
      if (!info) return null;
      const projDist = pointer.dist(info.projectedPoint);
      return (
        <g>
          {spec.specs.map((child, i) => {
            const sub = debugOverlay(child, pointer, false);
            if (!sub) return null;
            return <g key={`sub-${i}`}>{sub}</g>;
          })}
          <g opacity={opacity}>
            {info.delaunayTriangles.map((tri, i) => {
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
            {info.renderedStates.map((rs, i) => {
              const w = info.weights.get(i) ?? 0;
              const maxR = 8;
              const r = Math.sqrt(w) * maxR;
              const isDropState = i === info.closestIndex;
              return (
                <g key={`pt-${i}`}>
                  {/* indicator circle */}
                  <circle
                    {...rs.position.cxy()}
                    r={isDropState ? maxR : 3}
                    fill="none"
                    stroke="magenta"
                    strokeWidth={1.5}
                  />
                  {/* weight disk (only when active) */}
                  {active && r > 0.5 && (
                    <circle {...rs.position.cxy()} r={r} fill="magenta" />
                  )}
                </g>
              );
            })}
            <circle
              {...info.projectedPoint.cxy()}
              r={5}
              stroke="magenta"
              strokeWidth={2}
              fill="none"
            />
            <DistanceLine
              from={pointer}
              to={info.projectedPoint}
              distance={projDist}
            />
          </g>
        </g>
      );
    }

    case "vary": {
      const info = getTraceInfo(spec);
      if (!info) return null;
      const pos = info.renderedStates[0].position;
      const distance = pointer.dist(pos);
      return (
        <g opacity={opacity}>
          <circle {...pos.cxy()} r={5} fill="magenta" />
          <DistanceLine from={pos} to={pointer} distance={distance} />
        </g>
      );
    }

    case "drop-target": {
      const info = getTraceInfo(spec);
      if (!info || info.globalBounds.empty) return null;
      return (
        <g opacity={opacity}>
          <rect
            x={info.globalBounds.minX}
            y={info.globalBounds.minY}
            width={info.globalBounds.maxX - info.globalBounds.minX}
            height={info.globalBounds.maxY - info.globalBounds.minY}
            fill="magenta"
            fillOpacity={0.15}
            stroke="magenta"
            strokeWidth={1.5}
          />
          <DistanceLine
            from={boundsCenter(info.globalBounds)}
            to={pointer}
            distance={info.inside ? 0 : Infinity}
          />
        </g>
      );
    }

    // Passthrough to inner:
    case "on-drop":
    case "during":
    case "change-result":
    case "change-gap":
    case "with-snap-radius":
    case "with-drop-transition":
    case "with-branch-transition":
    case "with-chaining":
    case "with-init-context":
      return debugOverlay(spec.inner, pointer, active);

    case "switch-to-state-and-follow": {
      const info = getTraceInfo(spec);
      return info ? debugOverlay(info.tracedInner, pointer, active) : null;
    }

    case "substate":
      return debugOverlay(spec.innerSpec, pointer, active);

    case "react-to": {
      const info = getTraceInfo(spec);
      return info ? debugOverlay(info.tracedInner, pointer, active) : null;
    }

    default:
      assertNever(spec);
  }
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
  const [label, fontSize] =
    distance === Infinity ? ["∞", 24] : [`${Math.round(distance)}px`, 11];
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
        fontSize={fontSize}
        fontFamily="monospace"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label}
      </text>
    </g>
  );
}
