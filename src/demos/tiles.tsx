import _ from "lodash";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";

import { demo } from "../demo";
import { Vec2 } from "../math/vec2";
import { inXYWH } from "../math/xywh";
import { translate } from "../svgx/helpers";

type State = {
  w: number;
  h: number;
  tiles: { [key: string]: { x: number; y: number } };
};

const stateLonely: State = {
  w: 5,
  h: 5,
  tiles: {
    A: { x: 2, y: 2 },
  },
};

const stateFriendly: State = {
  w: 5,
  h: 5,
  tiles: {
    A: { x: 2, y: 2 },
    B: { x: 4, y: 4 },
  },
};

const draggable: Draggable<State> = ({ state, d }) => {
  const TILE_SIZE = 50;
  return (
    <g>
      {_.range(state.w).map((x) =>
        _.range(state.h).map((y) => (
          <rect
            id={`cell-${x}-${y}`}
            x={x * TILE_SIZE}
            y={y * TILE_SIZE}
            width={TILE_SIZE}
            height={TILE_SIZE}
            stroke="gray"
            strokeWidth={1}
            fill="none"
          />
        )),
      )}
      {Object.entries(state.tiles).map(([key, tile]) => (
        <g
          id={`tile-${key}`}
          transform={translate(tile.x * TILE_SIZE, tile.y * TILE_SIZE)}
          dragologyOnDrag={() =>
            d
              .closest(
                (
                  [
                    [-1, 0],
                    [1, 0],
                    [0, -1],
                    [0, 1],
                  ] as const
                ).map((dir) => {
                  const adjLoc = Vec2(tile).add(dir);
                  if (!inXYWH(adjLoc, [0, 0, state.w - 1, state.h - 1])) return;
                  if (Object.values(state.tiles).some((t) => adjLoc.eq(t)))
                    return;
                  const newState = structuredClone(state);
                  newState.tiles[key] = { x: adjLoc.x, y: adjLoc.y };
                  return d.between([state, newState]);
                }),
              )
              .withSnapRadius(3, { transition: true, chain: true })
              .withBranchTransition(false)
          }
        >
          <rect
            x={0}
            y={0}
            width={TILE_SIZE}
            height={TILE_SIZE}
            fill="#eee"
            stroke="black"
            strokeWidth={2}
          />
          <text
            x={TILE_SIZE / 2}
            y={TILE_SIZE / 2}
            dominantBaseline="middle"
            textAnchor="middle"
            fontSize={20}
            fill="black"
          >
            {key}
          </text>
        </g>
      ))}
    </g>
  );
};

export default demo(
  () => (
    <div>
      <DemoNotes>
        I'm trying to make dragging feel right here. Goal is for the tile to
        only drag orthogonally, AND to not jump discontinuously. This seems to
        require 'Relative Pointer Motion' mode (or divergent approaches).
      </DemoNotes>
      <h3 className="text-md font-medium italic mt-6 mb-1">lonely</h3>
      <DemoDraggable
        draggable={draggable}
        initialState={stateLonely}
        width={300}
        height={300}
      />
      <h3 className="text-md font-medium italic mt-6 mb-1">friendly</h3>
      <DemoDraggable
        draggable={draggable}
        initialState={stateFriendly}
        width={300}
        height={300}
      />
    </div>
  ),
  {
    tags: [
      "spec.withSnapRadius [chain]",
      "d.between",
      "spec.withBranchTransition",
    ],
  },
);
