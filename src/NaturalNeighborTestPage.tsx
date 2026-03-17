import { useCallback, useRef, useState } from "react";
import { naturalNeighborWeights } from "./math/natural-neighbor";
import { Vec2 } from "./math/vec2";

const WIDTH = 600;
const HEIGHT = 600;
const GRID_STEP = 10;
const DOT_RADIUS = 8;

type Dot = { x: number; y: number };

const INITIAL_DOTS: Dot[] = [
  { x: 150, y: 150 },
  { x: 450, y: 150 },
  { x: 450, y: 450 },
  { x: 150, y: 450 },
  { x: 300, y: 300 },
];

export const NaturalNeighborTestPage = () => {
  const [dots, setDots] = useState<Dot[]>(INITIAL_DOTS);
  const [selectedIdx, setSelectedIdx] = useState(4);
  const [dragging, setDragging] = useState<number | null>(null);
  const [queryPoint, setQueryPoint] = useState<Dot>({ x: 250, y: 200 });
  const [draggingQuery, setDraggingQuery] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const points = dots.map((d) => Vec2(d.x, d.y));

  // Compute weight grid for the selected dot.
  const grid: { x: number; y: number; weight: number }[] = [];
  for (let x = GRID_STEP; x < WIDTH; x += GRID_STEP) {
    for (let y = GRID_STEP; y < HEIGHT; y += GRID_STEP) {
      const result = naturalNeighborWeights(points, Vec2(x, y));
      let weight = 0;
      if (result && "weights" in result) {
        weight = result.weights.get(selectedIdx) ?? 0;
      } else if (result && "coincidentIndex" in result) {
        weight = result.coincidentIndex === selectedIdx ? 1 : 0;
      }
      grid.push({ x, y, weight });
    }
  }

  // Compute weights at the query point.
  const queryResult = naturalNeighborWeights(
    points,
    Vec2(queryPoint.x, queryPoint.y),
  );
  const queryWeights: { idx: number; weight: number }[] = [];
  if (queryResult && "weights" in queryResult) {
    for (const [idx, w] of queryResult.weights) {
      queryWeights.push({ idx, weight: w });
    }
  } else if (queryResult && "coincidentIndex" in queryResult) {
    queryWeights.push({ idx: queryResult.coincidentIndex, weight: 1 });
  }

  const getSvgPoint = useCallback((e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * HEIGHT,
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(idx);
    setSelectedIdx(idx);
  }, []);

  const onQueryPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggingQuery(true);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (draggingQuery) {
        const pt = getSvgPoint(e);
        setQueryPoint({ x: pt.x, y: pt.y });
        return;
      }
      if (dragging === null) return;
      const pt = getSvgPoint(e);
      setDots((prev) =>
        prev.map((d, i) => (i === dragging ? { x: pt.x, y: pt.y } : d)),
      );
    },
    [dragging, draggingQuery, getSvgPoint],
  );

  const onPointerUp = useCallback(() => {
    setDragging(null);
    setDraggingQuery(false);
  }, []);

  return (
    <div>
      <h2>Natural Neighbor Weights</h2>
      <p>
        Drag dots. Last dragged = selected (highlighted). Grid color = weight
        assigned to selected dot. Drag the green query point to see weight
        breakdown.
      </p>
      <div style={{ display: "flex", gap: 20 }}>
        <svg
          ref={svgRef}
          width={WIDTH}
          height={HEIGHT}
          style={{
            border: "1px solid #ccc",
            cursor: dragging !== null || draggingQuery ? "grabbing" : "default",
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* Weight grid */}
          {grid.map((cell, i) => (
            <rect
              key={i}
              x={cell.x - GRID_STEP / 2}
              y={cell.y - GRID_STEP / 2}
              width={GRID_STEP}
              height={GRID_STEP}
              fill={`rgba(59, 130, 246, ${cell.weight})`}
            />
          ))}

          {/* Lines from query point to contributing data points */}
          {queryWeights.map(({ idx, weight }) => (
            <line
              key={`line-${idx}`}
              x1={queryPoint.x}
              y1={queryPoint.y}
              x2={dots[idx].x}
              y2={dots[idx].y}
              stroke="#22c55e"
              strokeWidth={Math.max(1, weight * 6)}
              strokeOpacity={0.6}
            />
          ))}

          {/* Dots */}
          {dots.map((dot, i) => (
            <circle
              key={i}
              cx={dot.x}
              cy={dot.y}
              r={DOT_RADIUS}
              fill={i === selectedIdx ? "#ef4444" : "#333"}
              stroke={i === selectedIdx ? "#fff" : "none"}
              strokeWidth={2}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => onPointerDown(e, i)}
            />
          ))}

          {/* Weight labels on data dots */}
          {queryWeights.map(({ idx, weight }) => (
            <text
              key={`label-${idx}`}
              x={dots[idx].x}
              y={dots[idx].y - DOT_RADIUS - 4}
              textAnchor="middle"
              fontSize={12}
              fontFamily="monospace"
              fill="#333"
            >
              {(weight * 100).toFixed(1)}%
            </text>
          ))}

          {/* Query point */}
          <circle
            cx={queryPoint.x}
            cy={queryPoint.y}
            r={DOT_RADIUS}
            fill="#22c55e"
            stroke="#fff"
            strokeWidth={2}
            style={{ cursor: "grab" }}
            onPointerDown={onQueryPointerDown}
          />
        </svg>

        {/* Weight breakdown panel */}
        <div style={{ minWidth: 200 }}>
          <h3 style={{ margin: "0 0 8px" }}>Query Point Weights</h3>
          {queryWeights.length === 0 && (
            <p style={{ color: "#999" }}>Outside hull</p>
          )}
          {queryWeights.map(({ idx, weight }) => (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: idx === selectedIdx ? "#ef4444" : "#333",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontFamily: "monospace", fontSize: 14 }}>
                P{idx}: {(weight * 100).toFixed(1)}%
              </span>
              <div
                style={{
                  height: 8,
                  width: weight * 100,
                  background: "#22c55e",
                  borderRadius: 4,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
