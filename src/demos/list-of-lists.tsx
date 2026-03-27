import { produce } from "immer";
import _ from "lodash";
import { amb, produceAmb } from "../amb";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = {
  rows: {
    id: string;
    items: { id: string; label: string }[];
    color: string;
  }[];
};

const initialState: State = {
  rows: [
    {
      id: "row1",
      items: [
        { id: "A1", label: "A1" },
        { id: "B1", label: "B1" },
        { id: "C1", label: "C1" },
      ],
      color: "#f0f4ff",
    },
    {
      id: "row2",
      items: [
        { id: "A2", label: "A2" },
        { id: "B2", label: "B2" },
        { id: "C2", label: "C2" },
      ],
      color: "#fff4f0",
    },
    {
      id: "row3",
      items: [
        { id: "A3", label: "A3" },
        { id: "B3", label: "B3" },
        { id: "C3", label: "C3" },
      ],
      color: "#f0fff4",
    },
  ],
};

const draggable: Draggable<State> = ({ state, d }) => {
  const TILE_SIZE = 50;
  const TILE_GAP = 8;
  const ROW_PADDING = 8;
  const ROW_GAP = 10;
  const GRIP_WIDTH = 16;
  const GRIP_PADDING = 2;

  return (
    <g>
      {state.rows.map((row, rowIdx) => {
        return (
          <g
            id={`row-${row.id}`}
            transform={translate(
              0,
              rowIdx * (TILE_SIZE + ROW_PADDING * 2 + ROW_GAP),
            )}
            dragologyOnDrag={() => {
              const stateWithout = produce(state, (draft) => {
                draft.rows.splice(rowIdx, 1);
              });
              const statesWith = _.range(state.rows.length).map((newIdx) =>
                produce(stateWithout, (draft) => {
                  draft.rows.splice(newIdx, 0, row);
                }),
              );
              return d.closest(statesWith).whenFar(stateWithout).withFloating();
            }}
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
                dragologyZIndex={1}
                transform={translate(
                  GRIP_WIDTH +
                    GRIP_PADDING +
                    idx * (TILE_SIZE + TILE_GAP) +
                    ROW_PADDING,
                  ROW_PADDING,
                )}
                dragologyOnDrag={() => {
                  const stateWithout = produce(state, (draft) => {
                    draft.rows[rowIdx].items.splice(idx, 1);
                  });
                  const statesWith = produceAmb(stateWithout, (draft) => {
                    const newRow = amb(draft.rows);
                    const newColIdx = amb(_.range(newRow.items.length + 1));
                    newRow.items.splice(newColIdx, 0, p);
                  });
                  return d
                    .closest(statesWith)
                    .whenFar(stateWithout)
                    .withFloating();
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
        Uses <span className="font-mono">floating</span>.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={400}
        height={300}
      />
    </div>
  ),
  {
    tags: ["spec.onDrop", "d.closest", "spec.withFloating", "spec.whenFar"],
  },
);
