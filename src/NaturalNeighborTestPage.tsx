import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Delaunay } from "./math/delaunay";
import { naturalNeighborWeightsFromDelaunay } from "./math/natural-neighbor";
import { Vec2 } from "./math/vec2";

const WIDTH = 600;
const HEIGHT = 600;
const GRID_STEP = 2;
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
  const [projectOutside, setProjectOutside] = useState(false);
  const [renderMs, setRenderMs] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const points = useMemo(() => dots.map((d) => Vec2(d.x, d.y)), [dots]);

  const delaunay = useMemo(() => new Delaunay(points), [points]);

  // Draw weight grid on canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const t0 = performance.now();
    const opts = { projectOutside };

    const imageData = ctx.createImageData(WIDTH, HEIGHT);
    const data = imageData.data;

    for (let x = 0; x < WIDTH; x += GRID_STEP) {
      for (let y = 0; y < HEIGHT; y += GRID_STEP) {
        const cx = x + GRID_STEP / 2;
        const cy = y + GRID_STEP / 2;
        const result = naturalNeighborWeightsFromDelaunay(
          delaunay,
          Vec2(cx, cy),
          opts,
        );
        let weight = 0;
        if (result) {
          weight = result.weights.get(selectedIdx) ?? 0;
        }
        if (weight > 0) {
          const a = Math.round(weight * 255);
          const xEnd = Math.min(x + GRID_STEP, WIDTH);
          const yEnd = Math.min(y + GRID_STEP, HEIGHT);
          for (let py = y; py < yEnd; py++) {
            for (let px = x; px < xEnd; px++) {
              const i = (py * WIDTH + px) * 4;
              data[i] = 59;
              data[i + 1] = 130;
              data[i + 2] = 246;
              data[i + 3] = a;
            }
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    setRenderMs(performance.now() - t0);
  }, [delaunay, selectedIdx, projectOutside]);

  // Compute weights at the query point.
  const opts = { projectOutside };
  const queryResult = naturalNeighborWeightsFromDelaunay(
    delaunay,
    Vec2(queryPoint.x, queryPoint.y),
    opts,
  );
  const queryWeights: { idx: number; weight: number }[] = [];
  if (queryResult) {
    for (const [idx, w] of queryResult.weights) {
      queryWeights.push({ idx, weight: w });
    }
  }

  const getPoint = useCallback((e: React.PointerEvent) => {
    const el = canvasRef.current ?? svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
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
        const pt = getPoint(e);
        setQueryPoint({ x: pt.x, y: pt.y });
        return;
      }
      if (dragging === null) return;
      const pt = getPoint(e);
      setDots((prev) =>
        prev.map((d, i) => (i === dragging ? { x: pt.x, y: pt.y } : d)),
      );
    },
    [dragging, draggingQuery, getPoint],
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
        breakdown. Render: {renderMs.toFixed(1)}ms
      </p>
      <label>
        <input
          type="checkbox"
          checked={projectOutside}
          onChange={(e) => setProjectOutside(e.target.checked)}
        />{" "}
        Project outside hull
      </label>
      <div style={{ display: "flex", gap: 20 }}>
        <div
          style={{ position: "relative", width: WIDTH, height: HEIGHT }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* Canvas for the weight heatmap */}
          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              border: "1px solid #ccc",
            }}
          />
          {/* SVG overlay for interactive elements */}
          <svg
            ref={svgRef}
            width={WIDTH}
            height={HEIGHT}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              cursor:
                dragging !== null || draggingQuery ? "grabbing" : "default",
            }}
          >
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
        </div>

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
