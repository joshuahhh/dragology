import { demo } from "../demo";
import { DemoDraggable, DemoLink, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { translate } from "../svgx/helpers";

type State = {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
};

const state2: State = {
  p0: { x: 50, y: 50 },
  p1: { x: 200, y: 50 },
  p2: { x: 100, y: 200 },
  p3: { x: 300, y: 200 },
};

/** cubic bezier at t in [0, 1] */
function evalBezier(state: State, t: number): { x: number; y: number } {
  const { p0, p1, p2, p3 } = state;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}

function bezierPath(state: State): string {
  const { p0, p1, p2, p3 } = state;
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
}

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  const { p0, p1, p2, p3 } = state;
  const ENDPOINT_R = 12;
  const CONTROL_R = 8;

  // sample points for drag handles
  const CURVE_SAMPLES = 9;
  const tValues = Array.from(
    { length: CURVE_SAMPLES },
    (_, i) => (i + 1) / (CURVE_SAMPLES + 1),
  );

  return (
    <g>
      <line
        x1={p0.x}
        y1={p0.y}
        x2={p1.x}
        y2={p1.y}
        stroke="#ccc"
        strokeWidth={1}
        strokeDasharray="4,4"
      />
      <line
        x1={p3.x}
        y1={p3.y}
        x2={p2.x}
        y2={p2.y}
        stroke="#ccc"
        strokeWidth={1}
        strokeDasharray="4,4"
      />

      <path
        d={bezierPath(state)}
        fill="none"
        stroke="#1e40af"
        strokeWidth={6}
        strokeLinecap="round"
        style={{ pointerEvents: "none" }}
      />

      {/* handles */}
      {tValues.map((t) => {
        const pt = evalBezier(state, t);
        const isDragged = draggedId === `curve-t-${t}`;
        return (
          <circle
            id={`curve-t-${t}`}
            transform={translate(pt.x, pt.y)}
            cx={0}
            cy={0}
            r={isDragged ? 8 : 12}
            fill={isDragged ? "rgba(37, 99, 235, 0.3)" : "transparent"}
            dragologyOnDrag={() =>
              d.vary(
                state,
                [
                  param("p1", "x"),
                  param("p1", "y"),
                  param("p2", "x"),
                  param("p2", "y"),
                ],
                { pin: (s) => [s.p2.x - s.p1.x, s.p2.y - s.p1.y] },
              )
            }
          />
        );
      })}

      <circle
        id="control-p1"
        transform={translate(p1.x, p1.y)}
        cx={0}
        cy={0}
        r={CONTROL_R}
        fill={draggedId === "control-p1" ? "#f59e0b" : "#fbbf24"}
        stroke="#92400e"
        strokeWidth={2}
        dragologyOnDrag={() =>
          d.vary(state, [param("p1", "x"), param("p1", "y")])
        }
      />

      <circle
        id="control-p2"
        transform={translate(p2.x, p2.y)}
        cx={0}
        cy={0}
        r={CONTROL_R}
        fill={draggedId === "control-p2" ? "#f59e0b" : "#fbbf24"}
        stroke="#92400e"
        strokeWidth={2}
        dragologyOnDrag={() =>
          d.vary(state, [param("p2", "x"), param("p2", "y")])
        }
      />

      <circle
        id="endpoint-p0"
        transform={translate(p0.x, p0.y)}
        cx={0}
        cy={0}
        r={ENDPOINT_R}
        fill={draggedId === "endpoint-p0" ? "#dc2626" : "#ef4444"}
        stroke="#7f1d1d"
        strokeWidth={2}
        dragologyOnDrag={() =>
          d.vary(state, [param("p0", "x"), param("p0", "y")])
        }
      />

      <circle
        id="endpoint-p3"
        transform={translate(p3.x, p3.y)}
        cx={0}
        cy={0}
        r={ENDPOINT_R}
        fill={draggedId === "endpoint-p3" ? "#dc2626" : "#ef4444"}
        stroke="#7f1d1d"
        strokeWidth={2}
        dragologyOnDrag={() =>
          d.vary(state, [param("p3", "x"), param("p3", "y")])
        }
      />

      <text
        x={p0.x}
        y={p0.y - ENDPOINT_R - 5}
        textAnchor="middle"
        fontSize={12}
        fill="#666"
      >
        P0
      </text>
      <text
        x={p1.x}
        y={p1.y - CONTROL_R - 5}
        textAnchor="middle"
        fontSize={12}
        fill="#666"
      >
        P1
      </text>
      <text
        x={p2.x}
        y={p2.y - CONTROL_R - 5}
        textAnchor="middle"
        fontSize={12}
        fill="#666"
      >
        P2
      </text>
      <text
        x={p3.x}
        y={p3.y - ENDPOINT_R - 5}
        textAnchor="middle"
        fontSize={12}
        fill="#666"
      >
        P3
      </text>
    </g>
  );
};

export default demo(
  () => (
    <div>
      <DemoNotes>
        Drag the endpoints (red) or control points (yellow) orrrrr the curve
        (??).
        {" – "}
        <DemoLink href="https://www.orionreed.com/">Orion Reed</DemoLink>
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={state2}
        width={400}
        height={250}
      />
    </div>
  ),
  { tags: ["math", "d.vary"] },
);
