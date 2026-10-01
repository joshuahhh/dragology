import { useCallback, useEffect, useRef, useState } from "react";
import { demo } from "../demo";
import { DemoNotes } from "../demo/ui";

type Circle = {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
};

type Point = {
  id: string;
  circleId: string;
  dx: number;
  dy: number;
};

type State = {
  circles: Circle[];
  points: Point[];
};

const initialState: State = {
  circles: [
    { id: "c1", x: 100, y: 150, radius: 70, color: "#e57373" },
    { id: "c2", x: 350, y: 120, radius: 60, color: "#64b5f6" },
    { id: "c3", x: 250, y: 250, radius: 80, color: "#81c784" },
  ],
  points: [
    { id: "p1", circleId: "c1", dx: 20, dy: -10 },
    { id: "p2", circleId: "c1", dx: -30, dy: 20 },
    { id: "p3", circleId: "c2", dx: 0, dy: 15 },
    { id: "p4", circleId: "c3", dx: 25, dy: -25 },
  ],
};

type DragInfo =
  | { type: "circle"; circleId: string; offsetX: number; offsetY: number }
  | { type: "point"; pointId: string };

function getSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  return {
    x: (clientX - ctm.e) / ctm.a,
    y: (clientY - ctm.f) / ctm.d,
  };
}

function constrainToCircle(
  px: number,
  py: number,
  cx: number,
  cy: number,
  radius: number,
  margin: number,
) {
  const dx = px - cx;
  const dy = py - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const maxDist = radius - margin;
  if (dist <= maxDist) return { x: px, y: py };
  const scale = maxDist / dist;
  return { x: cx + dx * scale, y: cy + dy * scale };
}

// Exponential decay rate: fraction remaining per 16.67ms frame
const DECAY_RATE = 0.82;
const EPSILON = 0.5;

const MultiCirclePointsVanilla = () => {
  const [state, setState] = useState<State>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Transition offsets: when a point switches circles, we store the visual
  // offset (old position - new position) and decay it toward zero.
  const transitionOffsets = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );
  const animFrameRef = useRef<number>(0);
  const lastAnimTimeRef = useRef<number>(0);
  const [, forceRender] = useState(0);

  const runAnimLoop = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    lastAnimTimeRef.current = performance.now();

    const step = (now: number) => {
      const dt = now - lastAnimTimeRef.current;
      lastAnimTimeRef.current = now;
      const factor = Math.pow(DECAY_RATE, dt / 16.67);

      const offsets = transitionOffsets.current;
      let hasActive = false;
      for (const [id, offset] of offsets) {
        offset.x *= factor;
        offset.y *= factor;
        if (Math.abs(offset.x) < EPSILON && Math.abs(offset.y) < EPSILON) {
          offsets.delete(id);
        } else {
          hasActive = true;
        }
      }

      forceRender((t) => t + 1);
      if (hasActive) {
        animFrameRef.current = requestAnimationFrame(step);
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const activeMoveHandler = useRef<((e: PointerEvent) => void) | null>(null);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const svg = svgRef.current;
      if (!svg) return;
      const svgPt = getSvgPoint(svg, e.clientX, e.clientY);

      if (drag.type === "circle") {
        setState((prev) => ({
          ...prev,
          circles: prev.circles.map((c) =>
            c.id === drag.circleId
              ? {
                  ...c,
                  x: svgPt.x - drag.offsetX,
                  y: svgPt.y - drag.offsetY,
                }
              : c,
          ),
        }));
      } else {
        const prev = stateRef.current;
        const point = prev.points.find((p) => p.id === drag.pointId)!;

        let bestCircleId = "";
        let bestDist = Infinity;
        let bestDx = 0;
        let bestDy = 0;

        for (const circle of prev.circles) {
          const constrained = constrainToCircle(
            svgPt.x,
            svgPt.y,
            circle.x,
            circle.y,
            circle.radius,
            10,
          );
          const dist = Math.hypot(
            constrained.x - svgPt.x,
            constrained.y - svgPt.y,
          );
          if (dist < bestDist) {
            bestDist = dist;
            bestCircleId = circle.id;
            bestDx = constrained.x - circle.x;
            bestDy = constrained.y - circle.y;
          }
        }

        // If the point switched circles, compute a transition offset
        if (bestCircleId !== point.circleId) {
          const oldCircle = prev.circles.find((c) => c.id === point.circleId)!;
          const newCircle = prev.circles.find((c) => c.id === bestCircleId)!;
          const oldAbsX = oldCircle.x + point.dx;
          const oldAbsY = oldCircle.y + point.dy;
          const newAbsX = newCircle.x + bestDx;
          const newAbsY = newCircle.y + bestDy;

          // Add to any existing offset (in case of rapid switches)
          const existing = transitionOffsets.current.get(drag.pointId) ?? {
            x: 0,
            y: 0,
          };
          transitionOffsets.current.set(drag.pointId, {
            x: existing.x + (oldAbsX - newAbsX),
            y: existing.y + (oldAbsY - newAbsY),
          });
          runAnimLoop();
        }

        setState({
          ...prev,
          points: prev.points.map((p) =>
            p.id === drag.pointId
              ? { ...p, circleId: bestCircleId, dx: bestDx, dy: bestDy }
              : p,
          ),
        });
      }
    },
    [runAnimLoop],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setDraggedId(null);
    if (activeMoveHandler.current) {
      window.removeEventListener("pointermove", activeMoveHandler.current);
      activeMoveHandler.current = null;
    }
    window.removeEventListener("pointerup", handlePointerUp);
  }, []);

  const startDrag = useCallback(
    (e: React.PointerEvent, info: DragInfo) => {
      e.stopPropagation();
      e.preventDefault();
      dragRef.current = info;
      setDraggedId(info.type === "circle" ? info.circleId : info.pointId);
      activeMoveHandler.current = handlePointerMove;
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [handlePointerMove, handlePointerUp],
  );

  // Sort points so dragged one renders last (on top)
  const sortedPoints = [...state.points].sort((a, b) => {
    if (a.id === draggedId) return 1;
    if (b.id === draggedId) return -1;
    return 0;
  });

  return (
    <div>
      <DemoNotes>
        From-scratch React reimplementation of multi-circle-points,{" "}
        <b>without using Dragology</b>.
      </DemoNotes>
      <svg
        ref={svgRef}
        width={600}
        height={350}
        style={{ touchAction: "none" }}
      >
        {state.circles.map((circle) => {
          const isDragged = draggedId === circle.id;
          return (
            <circle
              key={circle.id}
              cx={circle.x}
              cy={circle.y}
              r={circle.radius}
              fill={circle.color + "20"}
              stroke={circle.color}
              strokeWidth={isDragged ? 3 : 2}
              strokeDasharray={isDragged ? undefined : "6 4"}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => {
                const svg = svgRef.current;
                if (!svg) return;
                const svgPt = getSvgPoint(svg, e.clientX, e.clientY);
                const c = stateRef.current.circles.find(
                  (ci) => ci.id === circle.id,
                )!;
                startDrag(e, {
                  type: "circle",
                  circleId: circle.id,
                  offsetX: svgPt.x - c.x,
                  offsetY: svgPt.y - c.y,
                });
              }}
            />
          );
        })}

        {sortedPoints.map((point) => {
          const circle = state.circles.find((c) => c.id === point.circleId)!;
          const offset = transitionOffsets.current.get(point.id);
          return (
            <circle
              key={point.id}
              cx={circle.x + point.dx + (offset?.x ?? 0)}
              cy={circle.y + point.dy + (offset?.y ?? 0)}
              r={10}
              fill={circle.color}
              stroke="white"
              strokeWidth={2}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => {
                transitionOffsets.current.delete(point.id);
                startDrag(e, { type: "point", pointId: point.id });
              }}
            />
          );
        })}
      </svg>
    </div>
  );
};

export default demo(MultiCirclePointsVanilla, {
  tags: ["vanilla"],
  hideByDefault: true,
  fuzz: false,
});
