import { produce } from "immer";
import _ from "lodash";
import { amb, produceAmb } from "../amb";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";
import { assertDefined } from "../utils/assert";

type State = {
  rows: {
    id: string;
    items: { id: string; label: string; w: number; h: number }[];
    color: string;
  }[];
};

const initialState: State = {
  rows: [
    {
      id: "row1",
      items: [
        { id: "A1", label: "A1", w: 108, h: 100 },
        { id: "B1", label: "B1", w: 50, h: 50 },
        { id: "C1", label: "C1", w: 50, h: 50 },
      ],
      color: "#f0f4ff",
    },
    {
      id: "row2",
      items: [
        { id: "A2", label: "A2", w: 50, h: 50 },
        { id: "B2", label: "B2", w: 108, h: 50 },
        { id: "C2", label: "C2", w: 50, h: 50 },
      ],
      color: "#fff4f0",
    },
    {
      id: "row3",
      items: [
        { id: "A3", label: "A3", w: 50, h: 50 },
        { id: "B3", label: "B3", w: 50, h: 50 },
        { id: "C3", label: "C3", w: 50, h: 108 },
      ],
      color: "#f0fff4",
    },
  ],
};

const draggable: Draggable<State> = ({ state, d }) => {
  const TILE_GAP = 8;
  const ROW_PADDING = 8;
  const ROW_GAP = 10;
  const GRIP_WIDTH = 16;
  const GRIP_PADDING = 2;

  let y = 0;

  return (
    <g>
      {state.rows.map((row, rowIdx) => {
        const origY = y;
        const maxItemHeight = assertDefined(
          _.max(row.items.map((item) => item.h)),
        );
        y += maxItemHeight + ROW_PADDING * 2 + ROW_GAP;
        let x = 0;
        return (
          <g
            id={`row-${row.id}`}
            transform={translate(0, origY)}
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
                _.sumBy(row.items, (item) => item.w) +
                (row.items.length - 1) * TILE_GAP +
                ROW_PADDING * 2
              }
              height={maxItemHeight + ROW_PADDING * 2}
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
                    cy={(maxItemHeight + ROW_PADDING * 2) / 2 + (i - 1) * 8}
                    r={1.5}
                    fill="#333"
                  />
                )),
              )}
            </g>
            {row.items.map((p, idx) => {
              const origX = x;
              x += p.w + TILE_GAP;
              return (
                <g
                  id={p.id}
                  dragologyZIndex={1}
                  transform={translate(
                    GRIP_WIDTH + GRIP_PADDING + origX + ROW_PADDING,
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
                    width={p.w}
                    height={p.h}
                    stroke="#aaa"
                    strokeWidth={1.5}
                    fill="white"
                    rx={4}
                  />
                  <text
                    x={p.w / 2}
                    y={p.h / 2}
                    dominantBaseline="middle"
                    textAnchor="middle"
                    fontSize={18}
                    fontWeight="500"
                    fill="#555"
                  >
                    {p.label}
                  </text>
                </g>
              );
            })}
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
        height={450}
      />
    </div>
  ),
  {
    tags: ["spec.onDrop", "d.closest", "spec.withFloating", "spec.whenFar"],
  },
);
