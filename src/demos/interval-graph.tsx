import { produce } from "immer";
import _ from "lodash";
import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { lessThan, param } from "../DragSpec";
import { translate } from "../svgx/helpers";

type Meeting = { start: number; end: number; room: number };
export type State = { meetings: Meeting[] };

export const initialState: State = {
  meetings: [
    { start: 20, end: 100, room: 0 },
    { start: 60, end: 160, room: 1 },
    { start: 10, end: 70, room: 2 },
    { start: 120, end: 200, room: 0 },
    { start: 80, end: 140, room: 2 },
  ],
};

const NUM_TRACKS = 4;
const TRACK_H = 40;
const GAP = 8;
const DOT_R = 7;
const BAR_H = 6;
const END_TIME = 250;
const MIN_LENGTH = 4 * DOT_R;
const GRAPH_X = END_TIME + 40;
export const CANVAS_W = GRAPH_X + END_TIME + 20;
export const CANVAS_H = NUM_TRACKS * (TRACK_H + GAP) + 20;
const NODE_R = 10;

const COLORS = ["#3b82f6", "#06b6d4", "#22c55e", "#f59e0b", "#8b5cf6"];

function overlaps(a: Meeting, b: Meeting) {
  return a.start < b.end && b.start < a.end;
}

export const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  const trackY = (track: number) => track * (TRACK_H + GAP) + TRACK_H / 2;

  const nodePos = (iv: Meeting) => ({
    x: GRAPH_X + (iv.start + iv.end) / 2,
    y: trackY(iv.room),
  });

  // All overlapping pairs
  const edges: [number, number][] = [];
  for (let i = 0; i < state.meetings.length; i++) {
    for (let j = i + 1; j < state.meetings.length; j++) {
      if (overlaps(state.meetings[i], state.meetings[j])) {
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
          x2={END_TIME}
          y2={trackY(t)}
          stroke="#94a3b8"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
      ))}

      {/* Meetings */}
      {state.meetings.map((iv, i) => {
        const y = trackY(iv.room);
        const color = COLORS[i % COLORS.length];
        const isDraggedBar = draggedId === `bar-${i}`;

        const endpointDrag = (endpoint: "start" | "end") =>
          d.vary(state, param("meetings", i, endpoint), {
            constraint: (s) => [
              lessThan(0, s.meetings[i].start),
              lessThan(s.meetings[i].start, s.meetings[i].end - MIN_LENGTH),
              lessThan(s.meetings[i].end, END_TIME),
            ],
          });

        const barStates = _.range(NUM_TRACKS).map((t) =>
          produce<State>(state, (draft) => {
            draft.meetings[i].room = t;
          }),
        );

        return (
          <g id={`meeting-${i}`} dragologyZIndex={isDraggedBar ? 1 : 0}>
            {/* Bar — drag to change track */}
            <rect
              transform={translate(iv.start, y - BAR_H / 2)}
              width={iv.end - iv.start}
              height={BAR_H}
              rx={3}
              fill={color}
              dragologyOnDrag={() =>
                d.between(barStates).withSnapRadius(10, { transition: true })
              }
            />

            {/* Left dot */}
            <circle
              id={`left-${i}`}
              transform={translate(iv.start + DOT_R, y)}
              r={DOT_R}
              fill={color}
              dragologyZIndex={2}
              dragologyOnDrag={() => endpointDrag("start")}
            />

            {/* Right dot */}
            <circle
              id={`right-${i}`}
              transform={translate(iv.end - DOT_R, y)}
              r={DOT_R}
              fill={color}
              dragologyZIndex={2}
              dragologyOnDrag={() => endpointDrag("end")}
            />

            {/* Graph node */}
            <circle
              transform={translate(nodePos(iv).x, nodePos(iv).y)}
              r={NODE_R}
              fill={color}
              stroke="white"
              strokeWidth={2}
              dragologyOnDrag={() =>
                d.between(barStates).withSnapRadius(10, { transition: 40 })
              }
            />
          </g>
        );
      })}

      {/* Graph: edges */}
      {edges.map(([ia, ib]) => {
        const a = nodePos(state.meetings[ia]);
        const b = nodePos(state.meetings[ib]);
        const sameTrack = state.meetings[ia].room === state.meetings[ib].room;
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
      width={CANVAS_W}
      height={CANVAS_H}
    />
  ),
  { tags: ["d.vary [constraint]", "d.between", "spec.withSnapRadius"] },
);
