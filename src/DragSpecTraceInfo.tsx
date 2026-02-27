import { DragSpecData } from "./DragSpec";
import { Vec2 } from "./math/vec2";
import { Svgx } from "./svgx";
import { path as svgPath } from "./svgx/helpers";
import { LayeredSvgx } from "./svgx/layers";
import { assertNever } from "./utils";

export type RenderedState = { layered: LayeredSvgx; position: Vec2 };

/**
 * Maps each DragSpec variant's `type` discriminant to its trace info
 * shape.
 */
export type DragSpecTraceInfoByType = {
  fixed: { renderedStates: RenderedState[] };
  "with-floating": { outputRendered: LayeredSvgx; elementPos: Vec2 };
  closest: { bestIndex: number };
  "with-background": { inForeground: boolean };
  "on-drop": Record<string, never>;
  during: { outputRendered: LayeredSvgx };
  vary: { renderedStates: RenderedState[]; currentParams: number[] };
  "with-distance": Record<string, never>;
  "with-snap-radius": {
    snapped: boolean;
    outputRendered: LayeredSvgx;
  };
  "with-drop-transition": Record<string, never>;
  "with-branch-transition": Record<string, never>;
  between: {
    renderedStates: RenderedState[];
    closestIndex: number;
    outputRendered: LayeredSvgx;
    delaunayTriangles: Vec2[][];
    projectedPoint: Vec2;
  };
  "switch-to-state-and-follow": { renderedStates: RenderedState[] };
  "drop-target": {
    renderedStates: RenderedState[];
    inside: boolean;
    globalCorners: Vec2[];
  };
  "with-chaining": Record<string, never>;
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
export function debugOverlay<T>(
  spec: DragSpecData<T>,
  pointer: Vec2,
): Svgx | null {
  switch (spec.type) {
    case "fixed": {
      const info = getTraceInfo(spec);
      if (!info) return null;
      const pos = info.renderedStates[0].position;
      const distance = pointer.dist(pos);
      return (
        <g opacity={0.8}>
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
      const innerOverlay = debugOverlay(spec.inner, pointer);
      const distance = pointer.dist(info.elementPos);
      return (
        <g>
          {innerOverlay}
          <g opacity={0.8}>
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
            const sub = debugOverlay(child, pointer);
            if (!sub) return null;
            return (
              <g key={i} opacity={i === info.bestIndex ? 1 : 0.2}>
                {sub}
              </g>
            );
          })}
        </g>
      );
    }

    case "with-background": {
      const info = getTraceInfo(spec);
      if (!info) return null;
      const fgOverlay = debugOverlay(spec.foreground, pointer);
      if (info.inForeground) {
        return fgOverlay;
      }
      const bgOverlay = debugOverlay(spec.background, pointer);
      if (!fgOverlay && !bgOverlay) return null;
      return (
        <g>
          {fgOverlay && <g opacity={0.15}>{fgOverlay}</g>}
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
          {info.renderedStates.map((rs, i) => (
            <circle
              key={`pt-${i}`}
              {...rs.position.cxy()}
              r={6}
              fill={i === info.closestIndex ? "magenta" : "none"}
              stroke="magenta"
              strokeWidth={1.5}
              opacity={i === info.closestIndex ? 1 : 0.5}
            />
          ))}
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
      );
    }

    case "vary": {
      const info = getTraceInfo(spec);
      if (!info) return null;
      const pos = info.renderedStates[0].position;
      const distance = pointer.dist(pos);
      return (
        <g opacity={0.8}>
          <circle {...pos.cxy()} r={5} fill="magenta" />
          <DistanceLine from={pos} to={pointer} distance={distance} />
        </g>
      );
    }

    case "drop-target": {
      const info = getTraceInfo(spec);
      if (!info) return null;
      return (
        <g opacity={0.8}>
          <polygon
            points={info.globalCorners.map((c) => `${c.x},${c.y}`).join(" ")}
            fill={info.inside ? "magenta" : "none"}
            fillOpacity={0.15}
            stroke="magenta"
            strokeWidth={1.5}
            strokeDasharray={info.inside ? undefined : "4 3"}
          />
        </g>
      );
    }

    // Passthrough to inner:
    case "on-drop":
    case "during":
    case "with-distance":
    case "with-snap-radius":
    case "with-drop-transition":
    case "with-branch-transition":
    case "with-chaining":
      return debugOverlay(spec.inner, pointer);

    case "switch-to-state-and-follow":
      return null;

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
