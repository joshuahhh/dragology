import { produce } from "immer";
import _ from "lodash";
import { amb, ambBoth, produceAmb } from "../amb";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = {
  rows: string[][];
};

const initialState: State = {
  rows: [
    ["A", "B"],
    ["C", "D"],
  ],
};

const draggable: Draggable<State> = ({ state, d }) => {
  const TILE_SIZE = 50;
  const TILE_GAP = 8;
  const ROW_PADDING = 8;
  const ROW_GAP = 10;

  return (
    <g transform={translate(20, 20)}>
      {state.rows.map((row, rowIdx) => (
        <g
          id={`row-${rowIdx}`}
          transform={translate(
            0,
            rowIdx * (TILE_SIZE + ROW_PADDING * 2 + ROW_GAP),
          )}
        >
          <rect
            width={
              row.length * (TILE_SIZE + TILE_GAP) - TILE_GAP + ROW_PADDING * 2
            }
            height={TILE_SIZE + ROW_PADDING * 2}
            fill="#f0f4ff"
            stroke="#aaa"
            strokeWidth={1.5}
            rx={6}
          />
          {row.map((p, idx) => (
            <g
              id={p}
              dragologyZIndex={1}
              transform={translate(
                idx * (TILE_SIZE + TILE_GAP) + ROW_PADDING,
                ROW_PADDING,
              )}
              dragology={() => {
                const stateWithout = produce(state, (draft) => {
                  draft.rows[rowIdx].splice(idx, 1);
                });
                const newStates = produceAmb(stateWithout, (draft) => {
                  // if (true) {
                  if (ambBoth()) {
                    const newRow = amb(draft.rows);
                    const newColIdx = amb(_.range(newRow.length + 1));
                    newRow.splice(newColIdx, 0, p);
                  } else {
                    draft.rows.push([p]);
                  }
                });
                return d
                  .closest(newStates)
                  .withFloating()
                  .onDrop(
                    produce((draft) => {
                      // remove empty rows
                      draft.rows = draft.rows.filter((r) => r.length > 0);
                    }),
                  )
                  .withBranchTransition(500);
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
                {p}
              </text>
            </g>
          ))}
        </g>
      ))}
    </g>
  );
};

export const listOfListsSimple = { draggable, initialState };
