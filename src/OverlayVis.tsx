import { useContext } from "react";
import { DragSpecData } from "./DragSpec";
import { getTraceInfo } from "./DragSpecTraceInfo";
import { Vec2 } from "./math/vec2";
import { StudioHackContext } from "./studio/StudioHackContext";
import { boundsCenter } from "./svgx/bounds";
import { path as svgPath } from "./svgx/helpers";
import { assertNever } from "./utils/assert";

/** Debug overlay component for a traced spec tree + pointer position. */
export function OverlayVis<T extends object>({
  spec,
  pointer,
  active = true,
}: {
  spec: DragSpecData<T>;
  pointer: Vec2;
  active?: boolean;
}) {
  const { overlayFullOpacity } = useContext(StudioHackContext);
  const opacity = overlayFullOpacity ? 1 : active ? 0.8 : 0.2;
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
      const distance = pointer.dist(info.elementPos);
      return (
        <g>
          <OverlayVis spec={spec.inner} pointer={pointer} active={active} />
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
          {spec.specs.map((child, i) => (
            <OverlayVis
              key={i}
              spec={child}
              pointer={pointer}
              active={active && i === info.bestIndex}
            />
          ))}
        </g>
      );
    }

    case "when-far": {
      const info = getTraceInfo(spec);
      if (!info) return null;
      if (info.inForeground) {
        return (
          <OverlayVis
            spec={spec.foreground}
            pointer={pointer}
            active={active && info.inForeground}
          />
        );
      }
      return (
        <g>
          <OverlayVis
            spec={spec.foreground}
            pointer={pointer}
            active={active && info.inForeground}
          />
          <OverlayVis
            spec={spec.background}
            pointer={pointer}
            active={active}
          />
        </g>
      );
    }

    case "between": {
      const info = getTraceInfo(spec);
      if (!info) return null;
      const projDist = pointer.dist(info.projectedPoint);
      return (
        <g>
          {spec.specs.map((child, i) => (
            <OverlayVis
              key={`sub-${i}`}
              spec={child}
              pointer={pointer}
              active={false}
            />
          ))}
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
                  <circle
                    {...rs.position.cxy()}
                    r={isDropState ? maxR : 3}
                    fill="none"
                    stroke="magenta"
                    strokeWidth={1.5}
                  />
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
          {info.exploredPositions?.map((ep, i) => (
            <line
              key={i}
              {...ep.xy1()}
              {...pointer.xy2()}
              stroke="magenta"
              strokeWidth={0.5}
              opacity={0.5}
            />
          ))}
          {info.exploredPositions?.map((ep, i) => (
            <circle
              key={`c${i}`}
              {...ep.cxy()}
              r={2}
              fill="magenta"
              opacity={0.5}
            />
          ))}
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
      return <OverlayVis spec={spec.inner} pointer={pointer} active={active} />;

    case "switch-to-state-and-follow": {
      const info = getTraceInfo(spec);
      return info ? (
        <OverlayVis spec={info.tracedInner} pointer={pointer} active={active} />
      ) : null;
    }

    case "substate":
      return (
        <OverlayVis spec={spec.innerSpec} pointer={pointer} active={active} />
      );

    case "react-to": {
      const info = getTraceInfo(spec);
      return info ? (
        <OverlayVis spec={info.tracedInner} pointer={pointer} active={active} />
      ) : null;
    }

    case "custom":
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
  const { overlayHideDistances } = useContext(StudioHackContext);
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
      {!overlayHideDistances && (
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
      )}
    </g>
  );
}
