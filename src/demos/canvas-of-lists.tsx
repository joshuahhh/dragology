import { produce } from "immer";
import _ from "lodash";
import { amb, produceAmb } from "../amb";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { translate } from "../svgx/helpers";

type State = {
  rows: Record<
    string,
    {
      items: { id: string; label: string }[];
      color: string;
      x: number;
      y: number;
    }
  >;
};

const colors = [
  "#c9e4f0", // soft blue
  "#f5d5d8", // soft pink
  "#d4edcf", // soft green
  "#f5eac9", // soft yellow
  "#e4d4e8", // soft purple
  "#f5dcc9", // soft peach
  "#c9f0ed", // soft aqua
  "#e8d4f0", // soft lavender
];

const initialState: State = {
  rows: {
    row1: {
      items: [
        { id: "A1", label: "A1" },
        { id: "B1", label: "B1" },
        { id: "C1", label: "C1" },
      ],
      color: colors[0],
      x: 0,
      y: 0,
    },
    row2: {
      items: [
        { id: "A2", label: "A2" },
        { id: "B2", label: "B2" },
        { id: "C2", label: "C2" },
      ],
      color: colors[1],
      x: 20,
      y: 100,
    },
    row3: {
      items: [
        { id: "A3", label: "A3" },
        { id: "B3", label: "B3" },
        { id: "C3", label: "C3" },
      ],
      color: colors[2],
      x: 100,
      y: 200,
    },
  },
};

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  const TILE_SIZE = 50;
  const TILE_GAP = 8;
  const ROW_PADDING = 8;
  const GRIP_WIDTH = 16;
  const GRIP_PADDING = 2;

  return (
    <g>
      {Object.entries(state.rows).map(([rowId, row]) => {
        const isDragged = draggedId === rowId;
        return (
          <g
            id={rowId}
            transform={translate(row.x, row.y)}
            dragologyZIndex={isDragged ? 10 : 0}
            dragologyOnDrag={() =>
              d.vary(state, [
                param("rows", rowId, "x"),
                param("rows", rowId, "y"),
              ])
            }
          >
            <rect
              width={
                GRIP_WIDTH +
                GRIP_PADDING +
                row.items.length * (TILE_SIZE + TILE_GAP) -
                TILE_GAP +
                ROW_PADDING * 2
              }
              height={TILE_SIZE + ROW_PADDING * 2}
              fill={row.color}
              stroke="#aaa"
              strokeWidth={1.5}
              rx={6}
            />
            {/* Grip dots */}
            <g opacity={0.35}>
              {[0, 1, 2].map((i) =>
                [0, 1].map((j) => (
                  <circle
                    cx={GRIP_WIDTH / 2 + 8 * j}
                    cy={(TILE_SIZE + ROW_PADDING * 2) / 2 + (i - 1) * 8}
                    r={1.5}
                    fill="#333"
                  />
                )),
              )}
            </g>
            {row.items.map((p, idx) => (
              <g
                id={p.id}
                transform={translate(
                  GRIP_WIDTH +
                    GRIP_PADDING +
                    idx * (TILE_SIZE + TILE_GAP) +
                    ROW_PADDING,
                  ROW_PADDING,
                )}
                dragologyZIndex={isDragged ? 11 : 1}
                dragologyOnDrag={() => {
                  const stateWithout = produce(state, (draft) => {
                    draft.rows[rowId].items.splice(idx, 1);
                    if (draft.rows[rowId].items.length === 0) {
                      delete draft.rows[rowId];
                    }
                  });
                  const statesWith = produceAmb(stateWithout, (draft) => {
                    const newRow = amb(Object.values(draft.rows));
                    const newColIdx = amb(_.range(newRow.items.length + 1));
                    newRow.items.splice(newColIdx, 0, p);
                  });
                  const [newRowId, newRowColor] = _.range(100)
                    .map(
                      (i) =>
                        [`row${i + 1}`, colors[i % colors.length]] as const,
                    )
                    .find(([id]) => !(id in stateWithout.rows))!;
                  const stateWithNewRow = produce(stateWithout, (draft) => {
                    draft.rows[newRowId] = {
                      items: [p],
                      color: newRowColor,
                      x: 0,
                      y: 0,
                    };
                  });
                  return d
                    .closest(statesWith)
                    .withFloating()
                    .whenFar(
                      d.vary(stateWithNewRow, [
                        param("rows", newRowId, "x"),
                        param("rows", newRowId, "y"),
                      ]),
                    );
                }}
              >
                <rect
                  x={0}
                  y={0}
                  width={TILE_SIZE}
                  height={TILE_SIZE}
                  stroke="#aaa"
                  strokeWidth={1.5}
                  fill="white"
                  rx={4}
                />
                <text
                  x={TILE_SIZE / 2}
                  y={TILE_SIZE / 2}
                  dominantBaseline="middle"
                  textAnchor="middle"
                  fontSize={18}
                  fontWeight="500"
                  fill="#555"
                >
                  {p.label}
                </text>
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
};

export default demo(
  () => (
    <div>
      <DemoNotes>
        Uses <span className="font-mono">floating</span>, with a{" "}
        <span className="font-mono">vary</span> backdrop.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={600}
        height={400}
      />
    </div>
  ),
  {
    tags: [
      "d.closest",
      "spec.withFloating",
      "d.vary",
      "spec.whenFar",
      "discrete on top of continuous",
    ],
  },
);
