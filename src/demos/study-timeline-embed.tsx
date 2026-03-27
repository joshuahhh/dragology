import _ from "lodash";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { inOrder, param } from "../DragSpec";
import { translate } from "../svgx/helpers";

type Block = { id: string; pos: number; track: number; color: string };
type State = { blocks: Block[] };

const initialState: State = {
  blocks: [
    { id: "Cats", pos: 10, track: 0, color: "#3b82f6" },
    { id: "Dogs", pos: 100, track: 1, color: "#ef4444" },
    { id: "Clouds", pos: 50, track: 3, color: "#22c55e" },
  ],
};

const NUM_TRACKS = 4;
const TRACK_H = 36;
const GAP = 6;
const BLOCK_W = 80;
const TRACK_W = 340;

const timelineDraggable: Draggable<State> = ({ state, embed }) => (
  <g transform={translate(10, 10)}>
    {/* Track backgrounds */}
    {_.range(NUM_TRACKS).map((t) => (
      <rect
        y={t * (TRACK_H + GAP)}
        width={TRACK_W}
        height={TRACK_H}
        rx={4}
        fill="#f3f4f6"
        stroke="#e5e7eb"
        strokeWidth={1}
      />
    ))}

    {/* Blocks */}
    {state.blocks.map((_block, i) => embed(blockDraggable, ["blocks", i]))}

    {/* Drop-shadow filter */}
    <defs>
      <filter id="shadow" x="-100%" y="-100%" width="300%" height="300%">
        <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
      </filter>
    </defs>
  </g>
);

const blockDraggable: Draggable<Block> = ({ state, d, draggedId }) => {
  const isDragged = draggedId === state.id;
  return (
    <g
      id={state.id}
      transform={translate(state.pos, state.track * (TRACK_H + GAP))}
      dragologyZIndex={isDragged ? 1 : 0}
      dragologyOnDrag={() =>
        d
          .closest(
            _.range(NUM_TRACKS).map((t) =>
              d.vary({ ...state, track: t }, param("pos"), {
                constraint: (s) => inOrder(0, s.pos, TRACK_W - BLOCK_W),
              }),
            ),
          )
          .withBranchTransition(100)
      }
    >
      <rect
        width={BLOCK_W}
        height={TRACK_H}
        rx={6}
        fill={state.color}
        filter="url(#shadow)"
      />
      <text
        x={BLOCK_W / 2}
        y={TRACK_H / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={13}
        fontWeight="600"
        fill="white"
      >
        {state.id}
      </text>
    </g>
  );
};

export default demo(
  () => (
    <>
      <DemoNotes>
        An approach to the "Timeline" study task using the experimental{" "}
        <code>embed()</code> operator, which lets you embed a sub-draggable
        within a parent draggable. Here, the timelineDraggable embeds a bunch of
        blockDraggables.
      </DemoNotes>
      <DemoDraggable
        draggable={timelineDraggable}
        initialState={initialState}
        width={370}
        height={200}
      />
    </>
  ),
  {
    tags: [
      "embed()",
      "d.vary [constraint]",
      "d.closest",
      "spec.withBranchTransition",
    ],
  },
);
