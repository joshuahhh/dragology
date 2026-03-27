import { produce } from "immer";
import _ from "lodash";
import { amb, produceAmb } from "../amb";
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

const tileColors: Record<
  string,
  { fill: string; stroke: string; text: string }
> = {
  // HSL fills: L=90 S=40, strokes: L=55 S=50, text: L=35 S=50
  A: {
    fill: "hsl(220, 40%, 90%)",
    stroke: "hsl(220, 50%, 55%)",
    text: "hsl(220, 50%, 35%)",
  },
  B: {
    fill: "hsl(35, 40%, 90%)",
    stroke: "hsl(35, 50%, 55%)",
    text: "hsl(35, 50%, 35%)",
  },
  C: {
    fill: "hsl(150, 40%, 90%)",
    stroke: "hsl(150, 50%, 55%)",
    text: "hsl(150, 50%, 35%)",
  },
  D: {
    fill: "hsl(330, 40%, 90%)",
    stroke: "hsl(330, 50%, 55%)",
    text: "hsl(330, 50%, 35%)",
  },
};

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  const TILE_SIZE = 50;
  const TILE_GAP = 8;
  const ROW_PADDING = 8;
  const ROW_GAP = 10;

  return (
    <g transform={translate(20, 20)}>
      <defs>
        <filter id="tile-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.25" />
        </filter>
      </defs>
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
            fill="#f5f7fa"
            stroke="#d4d8e0"
            strokeWidth={1}
            rx={10}
          />
          {row.map((p, idx) => (
            <g
              id={p}
              dragologyZIndex={1}
              transform={translate(
                idx * (TILE_SIZE + TILE_GAP) + ROW_PADDING,
                ROW_PADDING,
              )}
              dragologyOnDrag={() => {
                const stateWithout = produce(state, (draft) => {
                  draft.rows[rowIdx].splice(idx, 1);
                });
                const newStates = produceAmb(stateWithout, (draft) => {
                  if (true) {
                    // if (ambBoth()) {
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
                stroke={tileColors[p]?.stroke ?? "#aaa"}
                strokeWidth={1.5}
                fill={tileColors[p]?.fill ?? "white"}
                rx={8}
                filter={draggedId === p ? "url(#tile-shadow)" : undefined}
              />
              <text
                x={TILE_SIZE / 2}
                y={TILE_SIZE / 2}
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize={18}
                fontWeight="600"
                fontFamily="system-ui, sans-serif"
                fill={tileColors[p]?.text ?? "#555"}
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
