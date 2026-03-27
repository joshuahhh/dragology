import _ from "lodash";
import { useMemo, useState } from "react";
import { demo } from "../demo";
import {
  ConfigCheckbox,
  ConfigPanel,
  DemoDraggable,
  DemoWithConfig,
} from "../demo/ui";
import { Draggable } from "../draggable";
import { Vec2 } from "../math/vec2";
import { inXYWH } from "../math/xywh";
import { translate } from "../svgx/helpers";
import { defined } from "../utils/js";

type GameObject = {
  type: "wall" | "box" | "goal";
  pos: Vec2;
};

type State = {
  w: number;
  h: number;
  player: Vec2;
  objects: Record<string, GameObject>;
};

function makeSokobanState(board: string): State {
  const lines = board.split("\n");
  const state: State = {
    w: Math.max(...lines.map((l) => l.length)),
    h: lines.length,
    player: Vec2(0, 0),
    objects: {},
  };
  lines.forEach((line, y) => {
    line.split("").forEach((ch, x) => {
      const pos = Vec2(x, y);
      if (ch === "#") {
        state.objects[`wall-${x}-${y}`] = { type: "wall", pos };
      } else if (ch === "g") {
        state.objects[`goal-${x}-${y}`] = { type: "goal", pos };
      } else if (ch === "p") {
        state.player = pos;
      } else if (ch === "b") {
        state.objects[`box-${x}-${y}`] = { type: "box", pos };
      } else if (ch === "B") {
        state.objects[`box-${x}-${y}`] = { type: "box", pos };
        state.objects[`goal-${x}-${y}`] = { type: "goal", pos };
      }
    });
  });
  return state;
}

const initialState = makeSokobanState(`  #####
###   #
#gpb  #
### bg#
#g##b #
# # g ##
#b Bbbg#
#   g  #
########`);

type Config = {
  levelEditable: boolean;
};

const defaultConfig: Config = {
  levelEditable: false,
};

function draggableFactory(config: Config): Draggable<State> {
  return ({ state, d }) => {
    const TILE_SIZE = 50;

    function isInBounds(pos: Vec2): boolean {
      return inXYWH(pos, [0, 0, state.w - 1, state.h - 1]);
    }

    function isFloor(pos: Vec2): boolean {
      return (
        isInBounds(pos) &&
        !Object.values(state.objects).some(
          (w) => w.type === "wall" && pos.eq(w.pos),
        )
      );
    }

    function idOfBoxAt(pos: Vec2): string | undefined {
      return _.findKey(state.objects, (o) => o.type === "box" && pos.eq(o.pos));
    }

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

        {/* Objects */}
        {Object.entries(state.objects).map(([id, object]) => (
          <g
            id={`object-${id}`}
            transform={translate(
              object.pos.x * TILE_SIZE,
              object.pos.y * TILE_SIZE,
            )}
            dragologyZIndex={object.type === "goal" ? 1 : 0}
            dragologyOnDrag={
              config.levelEditable
                ? () =>
                    d
                      .closest(
                        (
                          [
                            [-1, 0],
                            [1, 0],
                            [0, -1],
                            [0, 1],
                          ] as const
                        )
                          .map((dir) => {
                            const newLoc = object.pos.add(dir);
                            if (!isInBounds(newLoc)) return;
                            return d.between([
                              state,
                              {
                                ...state,
                                objects: {
                                  ...state.objects,
                                  [id]: { ...object, pos: newLoc },
                                },
                              },
                            ]);
                          })
                          .filter(defined),
                      )
                      .withSnapRadius(3, { transition: true, chain: true })
                : undefined
            }
          >
            {object.type === "wall" ? (
              <rect
                x={0}
                y={0}
                width={TILE_SIZE}
                height={TILE_SIZE}
                fill="black"
              />
            ) : object.type === "box" ? (
              <rect
                x={0}
                y={0}
                width={TILE_SIZE}
                height={TILE_SIZE}
                fill="brown"
                stroke="black"
                strokeWidth={2}
              />
            ) : (
              <rect
                x={TILE_SIZE / 4}
                y={TILE_SIZE / 4}
                width={TILE_SIZE / 2}
                height={TILE_SIZE / 2}
                fill="orange"
              />
            )}
          </g>
        ))}

        {/* Player */}
        <g
          id="player"
          transform={translate(
            state.player.x * TILE_SIZE,
            state.player.y * TILE_SIZE,
          )}
          dragologyZIndex={2}
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
                )
                  .map((dir) => {
                    const curLoc = Vec2(state.player);
                    const newLoc = curLoc.add(dir);
                    if (!isFloor(newLoc)) return;

                    const boxId = idOfBoxAt(newLoc);
                    if (boxId === undefined) {
                      return d.between([state, { ...state, player: newLoc }]);
                    }

                    // Box present, try to push
                    const boxNewLoc = newLoc.add(dir);
                    if (!isFloor(boxNewLoc)) return;
                    if (idOfBoxAt(boxNewLoc) !== undefined) return;

                    return d.between([
                      state,
                      {
                        ...state,
                        player: newLoc,
                        objects: {
                          ...state.objects,
                          [boxId]: {
                            ...state.objects[boxId],
                            pos: boxNewLoc,
                          },
                        },
                      },
                    ]);
                  })
                  .filter(defined),
              )
              .withSnapRadius(3, { transition: true, chain: true })
          }
        >
          <rect
            x={0}
            y={0}
            width={TILE_SIZE}
            height={TILE_SIZE}
            fill="transparent"
          />
          <text
            x={TILE_SIZE / 2}
            y={TILE_SIZE / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={40}
            pointerEvents="none"
          >
            🧍
          </text>
        </g>
      </g>
    );
  };
}

export default demo(
  () => {
    const [config, setConfig] = useState(defaultConfig);

    const draggable = useMemo(() => draggableFactory(config), [config]);

    return (
      <DemoWithConfig>
        <DemoDraggable
          draggable={draggable}
          initialState={initialState}
          width={500}
          height={500}
        />
        <ConfigPanel>
          <ConfigCheckbox
            value={config.levelEditable}
            onChange={(v) => setConfig((c) => ({ ...c, levelEditable: v }))}
          >
            Make level editable
          </ConfigCheckbox>
        </ConfigPanel>
      </DemoWithConfig>
    );
  },
  { tags: ["spec.withSnapRadius [chain]", "d.between", "puzzle"] },
);
