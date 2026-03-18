import { produce } from "immer";
import _ from "lodash";
import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { inOrder, param } from "../DragSpec";
import { translate } from "../svgx/helpers";

type Interval = { left: number; right: number; track: number };
type State = { intervals: Interval[] };

const initialState: State = {
  intervals: [
    { left: 20, right: 100, track: 0 },
    { left: 60, right: 160, track: 1 },
    { left: 10, right: 70, track: 2 },
    { left: 120, right: 200, track: 0 },
    { left: 80, right: 140, track: 2 },
  ],
};

const NUM_TRACKS = 4;
const TRACK_H = 40;
const GAP = 8;
const DOT_R = 7;
const BAR_H = 6;
const TRACK_W = 300;
const MIN_WIDTH = 10;
const GRAPH_X = TRACK_W + 40;
const NODE_R = 10;

const COLORS = ["#3b82f6", "#06b6d4", "#22c55e", "#f59e0b", "#8b5cf6"];

function overlaps(a: Interval, b: Interval) {
  return a.left < b.right && b.left < a.right;
}

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  const trackY = (track: number) => track * (TRACK_H + GAP) + TRACK_H / 2;

  const nodePos = (iv: Interval) => ({
    x: GRAPH_X + (iv.left + iv.right) / 2,
    y: trackY(iv.track),
  });

  // All overlapping pairs
  const edges: [number, number][] = [];
  for (let i = 0; i < state.intervals.length; i++) {
    for (let j = i + 1; j < state.intervals.length; j++) {
      if (overlaps(state.intervals[i], state.intervals[j])) {
        edges.push([i, j]);
      }
    }
  }

  return (
    <g transform={translate(10, 10)}>
      {/* Track lines */}
      {_.range(NUM_TRACKS).map((t) => (
        <line
          key={t}
          x1={0}
          y1={trackY(t)}
          x2={TRACK_W}
          y2={trackY(t)}
          stroke="#94a3b8"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
      ))}

      {/* Intervals */}
      {state.intervals.map((iv, i) => {
        const y = trackY(iv.track);
        const color = COLORS[i % COLORS.length];
        const isDraggedBar = draggedId === `bar-${i}`;

        const endpointDrag = (endpoint: "left" | "right") =>
          d.vary(state, param("intervals", i, endpoint), {
            constraint: (s) =>
              inOrder(0, s.intervals[i].left, s.intervals[i].right, TRACK_W),
          });

        const barStates = _.range(NUM_TRACKS).map((t) =>
          produce<State>(state, (draft) => {
            draft.intervals[i].track = t;
          }),
        );

        return (
          <g id={`interval-${i}`} data-z-index={isDraggedBar ? 1 : 0}>
            {/* Bar — drag to change track */}
            <rect
              transform={translate(iv.left, y - BAR_H / 2)}
              width={Math.max(iv.right - iv.left, MIN_WIDTH)}
              height={BAR_H}
              rx={3}
              fill={color}
              style={{ cursor: "grab" }}
              dragology={() =>
                d.between(barStates).withSnapRadius(10, { transition: true })
              }
            />

            {/* Left dot */}
            <circle
              id={`left-${i}`}
              transform={translate(iv.left, y)}
              r={DOT_R}
              fill={color}
              stroke="white"
              strokeWidth={2}
              data-z-index={2}
              dragology={() => endpointDrag("left")}
            />

            {/* Right dot */}
            <circle
              id={`right-${i}`}
              transform={translate(iv.right, y)}
              r={DOT_R}
              fill={color}
              stroke="white"
              strokeWidth={2}
              data-z-index={2}
              dragology={() => endpointDrag("right")}
            />

            {/* Graph node */}
            <circle
              transform={translate(nodePos(iv).x, nodePos(iv).y)}
              r={NODE_R}
              fill={color}
              stroke="white"
              strokeWidth={2}
              dragology={() =>
                d.between(barStates).withSnapRadius(10, { transition: 40 })
              }
            />
          </g>
        );
      })}

      {/* Graph: edges */}
      {edges.map(([ia, ib]) => {
        const a = nodePos(state.intervals[ia]);
        const b = nodePos(state.intervals[ib]);
        const sameTrack =
          state.intervals[ia].track === state.intervals[ib].track;
        return (
          <g>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#ef4444"
              strokeWidth={6}
              strokeOpacity={sameTrack ? 0.6 : 0}
            />
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
          </g>
        );
      })}
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={GRAPH_X + TRACK_W + 20}
      height={NUM_TRACKS * (TRACK_H + GAP) + 20}
    />
  ),
  { tags: ["d.vary [w/constraint]", "d.between", "spec.withSnapRadius"] },
);
