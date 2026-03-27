import _ from "lodash";
import { useMemo, useState } from "react";
import { amb, runAmb } from "../amb";
import { demo } from "../demo";
import {
  ConfigCheckbox,
  ConfigPanel,
  ConfigSlider,
  DemoDraggable,
  DemoLink,
  DemoNotes,
  DemoWithConfig,
} from "../demo/ui";
import { Draggable } from "../draggable";
import { Vec2 } from "../math/vec2";
import { path, rotateDeg, translate } from "../svgx/helpers";

type State = {
  missingSquare: Vec2;
};

const initialState: State = {
  missingSquare: Vec2(0, 0),
};

type Config = {
  snappyMode: boolean;
  mazeMode: boolean;
  boardLevel: number;
};

const defaultConfig: Config = {
  snappyMode: false,
  mazeMode: false,
  boardLevel: 3,
};

const DEFAULT_CELL_SIZE = 40;
const PADDING_RATIO = 6 / 40;
const MAX_DIAGRAM_SIZE = 370;

const COLORS = [
  "lightblue",
  "lightgreen",
  "lightpink",
  "lightyellow",
  "lightgray",
];

function draggableFactory(config: Config): Draggable<State> {
  const { boardLevel } = config;
  const cellSize = Math.min(
    DEFAULT_CELL_SIZE,
    MAX_DIAGRAM_SIZE / 2 ** boardLevel,
  );
  const padding = cellSize * PADDING_RATIO;
  return ({ state, d }) => (
    <g>
      {drawState(state, boardLevel, cellSize)}
      <rect
        id="missing-square"
        dragologyZIndex={1}
        transform={translate(state.missingSquare.mul(cellSize).add(padding))}
        width={cellSize - 2 * padding}
        height={cellSize - 2 * padding}
        fill="black"
        dragologyOnDrag={() => {
          if (config.mazeMode) {
            const singleRotations = singleRotationStates(state, boardLevel);
            return config.snappyMode
              ? d
                  .closest([state, singleRotations])
                  .withFloating({ ghost: { opacity: 0.2 } })
                  .withChaining()
              : d
                  .closest(singleRotations.map((s) => d.between([state, s])))
                  .withSnapRadius(1, { chain: true });
          } else {
            const all = allStates(boardLevel);
            return config.snappyMode
              ? d.closest(all).withFloating({ ghost: { opacity: 0.2 } })
              : d.between(all);
          }
        }}
      />
    </g>
  );
}

function allStates(boardLevel: number): State[] {
  return runAmb(() => ({
    missingSquare: Vec2(
      amb(_.range(2 ** boardLevel)),
      amb(_.range(2 ** boardLevel)),
    ),
  }));
}

function singleRotationStates(state: State, boardLevel: number): State[] {
  return _.range(1, boardLevel + 1).flatMap((level) => {
    const fullCount = 2 ** level;
    const halfCount = 2 ** (level - 1);
    const isCenterL = state.missingSquare.x % fullCount === halfCount - 1;
    const isCenterR = state.missingSquare.x % fullCount === halfCount;
    const isCenterT = state.missingSquare.y % fullCount === halfCount - 1;
    const isCenterB = state.missingSquare.y % fullCount === halfCount;
    if ((isCenterL || isCenterR) && (isCenterT || isCenterB)) {
      return [
        {
          ...state,
          missingSquare: state.missingSquare.add([isCenterL ? 1 : -1, 0]),
        },
        {
          ...state,
          missingSquare: state.missingSquare.add([0, isCenterT ? 1 : -1]),
        },
      ];
    } else {
      return [];
    }
  });
}

function drawState(state: State, boardLevel: number, cellSize: number) {
  const padding = cellSize * PADDING_RATIO;
  if (boardLevel === 0) {
    return (
      <rect width={cellSize} height={cellSize} fill="white" stroke="black" />
    );
  }

  const halfCount = 2 ** (boardLevel - 1);
  const missingLeft = state.missingSquare.x < halfCount;
  const missingTop = state.missingSquare.y < halfCount;

  return (
    <g>
      <g transform={translate(0, 0)}>
        {drawState(
          {
            missingSquare:
              missingLeft && missingTop
                ? state.missingSquare
                : Vec2(halfCount - 1, halfCount - 1),
          },
          boardLevel - 1,
          cellSize,
        )}
      </g>
      <g transform={translate(halfCount * cellSize, 0)}>
        {drawState(
          {
            missingSquare:
              !missingLeft && missingTop
                ? state.missingSquare.sub(Vec2(halfCount, 0))
                : Vec2(0, halfCount - 1),
          },
          boardLevel - 1,
          cellSize,
        )}
      </g>
      <g transform={translate(0, halfCount * cellSize)}>
        {drawState(
          {
            missingSquare:
              missingLeft && !missingTop
                ? state.missingSquare.sub(Vec2(0, halfCount))
                : Vec2(halfCount - 1, 0),
          },
          boardLevel - 1,
          cellSize,
        )}
      </g>
      <g transform={translate(halfCount * cellSize, halfCount * cellSize)}>
        {drawState(
          {
            missingSquare:
              !missingLeft && !missingTop
                ? state.missingSquare.sub(Vec2(halfCount, halfCount))
                : Vec2(0, 0),
          },
          boardLevel - 1,
          cellSize,
        )}
        {/* the tromino! */}
        <path
          d={path(
            "M",
            [padding, padding],
            "L",
            [padding - cellSize, padding],
            "L",
            [padding - cellSize, cellSize - padding],
            "L",
            [cellSize - padding, cellSize - padding],
            "L",
            [cellSize - padding, padding - cellSize],
            "L",
            [padding, padding - cellSize],
            "Z",
          )}
          transform={rotateDeg(
            missingLeft ? (missingTop ? 0 : 270) : missingTop ? 90 : 180,
            [0, 0],
          )}
          fill={COLORS[boardLevel - 1]}
          stroke="black"
        />
      </g>
    </g>
  );
}

// # Component

export default demo(
  () => {
    const [config, setConfig] = useState(defaultConfig);

    const draggable = useMemo(() => draggableFactory(config), [config]);

    const diagramSize = Math.min(
      2 ** config.boardLevel * DEFAULT_CELL_SIZE,
      MAX_DIAGRAM_SIZE,
    );

    return (
      <DemoWithConfig>
        <div>
          <DemoNotes>
            Inspired by a{" "}
            <DemoLink href="https://www.reddit.com/r/math/comments/gpxwl4/animated_golombs_ltromino_tiling/">
              neat Reddit post
            </DemoLink>
            .
          </DemoNotes>
          <DemoDraggable
            key={config.boardLevel}
            draggable={draggable}
            initialState={initialState}
            width={diagramSize}
            height={diagramSize}
          />
        </div>
        <ConfigPanel>
          <ConfigCheckbox
            value={config.snappyMode}
            onChange={(v) => setConfig((c) => ({ ...c, snappyMode: v }))}
          >
            Snappy mode
          </ConfigCheckbox>
          <ConfigCheckbox
            value={config.mazeMode}
            onChange={(v) => setConfig((c) => ({ ...c, mazeMode: v }))}
          >
            Maze mode
          </ConfigCheckbox>
          <ConfigSlider
            label="Board level"
            value={config.boardLevel}
            onChange={(v) => setConfig((c) => ({ ...c, boardLevel: v }))}
            min={1}
            max={4}
          />
        </ConfigPanel>
      </DemoWithConfig>
    );
  },
  {
    tags: [
      "spec.withSnapRadius [chain]",
      "math",
      "fancy",
      "d.closest",
      "spec.withFloating [ghost]",
      "d.between",
      "spec.withChaining",
      "puzzle",
    ],
  },
);
