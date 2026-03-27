import { produce } from "immer";
import _ from "lodash";
import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = {
  rows: string[][];
};

const initialState: State = {
  rows: [
    ["A1", "B1", "C1"],
    ["A2", "B2", "C2"],
    ["A3", "B3", "C3"],
  ],
};

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  const TILE_SIZE = 50;
  const ROW_PADDING = 5;

  const draggedRow = draggedId
    ? state.rows.find((row) => row.includes(draggedId))
    : undefined;

  return (
    <g>
      {state.rows.map((row, rowIdx) => (
        <g transform={translate(0, rowIdx * (TILE_SIZE + ROW_PADDING * 2))}>
          {row.map((p, idx) => (
            <g
              id={p}
              dragologyZIndex={
                p === draggedId
                  ? 2
                  : draggedRow && row.includes(draggedId!)
                    ? 1
                    : 0
              }
              transform={translate(idx * TILE_SIZE + ROW_PADDING, ROW_PADDING)}
              dragologyOnDrag={() => {
                const draggedRowIdx = state.rows.findIndex((r) =>
                  r.includes(p),
                );
                const draggedRow = state.rows[draggedRowIdx];
                const draggedColIdx = draggedRow.indexOf(p);

                const states = [];
                for (const colIdx of _.range(draggedRow.length)) {
                  for (const rowIdx of _.range(state.rows.length)) {
                    states.push(
                      produce(state, (draft) => {
                        const row = draft.rows[draggedRowIdx];
                        row.splice(draggedColIdx, 1);
                        row.splice(colIdx, 0, p);
                        draft.rows.splice(draggedRowIdx, 1);
                        draft.rows.splice(rowIdx, 0, row);
                      }),
                    );
                  }
                }
                return d.between(states).withSnapRadius(10);
              }}
            >
              <rect
                x={0}
                y={0}
                width={TILE_SIZE}
                height={TILE_SIZE}
                stroke="black"
                strokeWidth={2}
                fill="white"
              />
              <text
                x={TILE_SIZE / 2}
                y={TILE_SIZE / 2}
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize={20}
                fill="black"
              >
                {p}
              </text>
            </g>
          ))}
        </g>
      ))}
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={250}
      height={200}
    />
  ),
  { tags: ["d.between", "reordering"] },
);
