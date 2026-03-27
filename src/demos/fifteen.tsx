import _ from "lodash";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";

import { demo } from "../demo";
import { translate } from "../svgx/helpers";

type State = {
  w: number;
  h: number;
  tiles: Record<string, { x: number; y: number }>;
};

const initialState: State = {
  w: 4,
  h: 4,
  tiles: {
    "12": { x: 0, y: 0 },
    "1": { x: 1, y: 0 },
    "2": { x: 2, y: 0 },
    "15": { x: 3, y: 0 },
    "11": { x: 0, y: 1 },
    "6": { x: 1, y: 1 },
    "5": { x: 2, y: 1 },
    "8": { x: 3, y: 1 },
    "7": { x: 0, y: 2 },
    "10": { x: 1, y: 2 },
    "9": { x: 2, y: 2 },
    "4": { x: 3, y: 2 },
    "13": { x: 1, y: 3 },
    "14": { x: 2, y: 3 },
    "3": { x: 3, y: 3 },
    " ": { x: 0, y: 3 },
  },
};

const draggable: Draggable<State> = ({ state, d }) => {
  const TILE_SIZE = 50;

  return (
    <g>
      {/* Grid */}
      {_.range(state.w).map((x) =>
        _.range(state.h).map((y) => (
          <rect
            id={`grid-${x}-${y}`}
            x={x * TILE_SIZE}
            y={y * TILE_SIZE}
            width={TILE_SIZE}
            height={TILE_SIZE}
            stroke="gray"
            strokeWidth={1}
            fill="none"
            dragologyZIndex={-5}
          />
        )),
      )}

      {/* Tiles */}
      {Object.entries(state.tiles).map(([key, tile]) => (
        <g
          id={`tile-${key}`}
          transform={translate(tile.x * TILE_SIZE, tile.y * TILE_SIZE)}
          dragologyOnDrag={() => {
            const betweens = (
              [
                [-1, 0],
                [1, 0],
                [0, -1],
                [0, 1],
              ] as const
            ).map(([dx, dy]) => {
              const adjX = tile.x + dx;
              const adjY = tile.y + dy;
              if (adjX < 0 || adjX >= state.w || adjY < 0 || adjY >= state.h)
                return;
              const adjTileKey = _.findKey(
                state.tiles,
                (t) => t.x === adjX && t.y === adjY,
              );
              if (!adjTileKey) return;
              if (!(key === " " || adjTileKey === " ")) return;
              const newState = structuredClone(state);
              newState.tiles[key] = { x: adjX, y: adjY };
              newState.tiles[adjTileKey] = { x: tile.x, y: tile.y };
              return d.between([state, newState]);
            });
            return d.closest(betweens).withSnapRadius(10, { chain: true });
          }}
        >
          <rect
            x={0}
            y={0}
            width={TILE_SIZE}
            height={TILE_SIZE}
            fill={key === " " ? "transparent" : "#eee"}
            stroke={key === " " ? "transparent" : "black"}
            strokeWidth={2}
          />
          {key !== " " && (
            <text
              x={TILE_SIZE / 2}
              y={TILE_SIZE / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={20}
              pointerEvents="none"
            >
              {key}
            </text>
          )}
        </g>
      ))}
    </g>
  );
};

export default demo(
  () => (
    <div>
      <DemoNotes>Weird experiment: I made the blank draggable</DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={250}
        height={250}
      />
    </div>
  ),
  { tags: ["spec.withSnapRadius [chain]", "d.between", "puzzle"] },
);
