import { produce } from "immer";
import _ from "lodash";
import { useMemo, useState } from "react";
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
import { path, translate } from "../svgx/helpers";
import { makeId } from "../utils";

// A lozenge tiling of a hexagon with side lengths a, b, c is the same
// thing as a plane partition in an a×b×c box: a stack of unit cubes
// piled into the corner of a room, viewed isometrically. Each lozenge
// is a visible face of a cube (or of the room's walls/floor).
//
// The elementary "flip" of a lozenge tiling (rotate three lozenges
// around a hexagon) is adding or removing a single cube. So we let
// you drag cubes: removable cubes (outer corners of the pile) can be
// dragged out, and addable positions (inner corners) can receive a
// cube from the spare pile.

// # State

type Cube = { i: number; j: number; k: number };

type State = {
  a: number;
  b: number;
  c: number;
  cubes: Record<string, Cube>;
};

type Config = {
  a: number;
  b: number;
  c: number;
  seed: number;
  showHints: boolean;
};

const defaultConfig: Config = {
  a: 4,
  b: 4,
  c: 4,
  seed: 0,
  showHints: true,
};

/** heights[i][j] = number of cubes stacked at (i, j) */
function heights(state: State): number[][] {
  const h = _.range(state.a).map(() => _.range(state.b).map(() => 0));
  for (const cube of Object.values(state.cubes)) {
    h[cube.i][cube.j] = Math.max(h[cube.i][cube.j], cube.k + 1);
  }
  return h;
}

/** Cubes that can be removed while keeping a valid plane partition. */
function removableCubeIds(state: State): string[] {
  const h = heights(state);
  const hAt = (i: number, j: number) =>
    i < state.a && j < state.b ? h[i][j] : 0;
  return Object.entries(state.cubes)
    .filter(
      ([, { i, j, k }]) =>
        k === h[i][j] - 1 && hAt(i + 1, j) <= k && hAt(i, j + 1) <= k,
    )
    .map(([id]) => id);
}

/** Positions where a cube can be added while keeping a valid plane partition. */
function addablePositions(state: State): Cube[] {
  const h = heights(state);
  const hAt = (i: number, j: number) => (i < 0 || j < 0 ? Infinity : h[i][j]);
  const result: Cube[] = [];
  for (let i = 0; i < state.a; i++) {
    for (let j = 0; j < state.b; j++) {
      const k = h[i][j];
      if (k < state.c && hAt(i - 1, j) > k && hAt(i, j - 1) > k) {
        result.push({ i, j, k });
      }
    }
  }
  return result;
}

// Deterministic PRNG so "randomize" gives a stable initial state.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeInitialState({ a, b, c, seed }: Config): State {
  let state: State = { a, b, c, cubes: {} };
  if (seed === 0) {
    // A tidy staircase to start with.
    for (let i = 0; i < a; i++) {
      for (let j = 0; j < b; j++) {
        const h = _.clamp(c + 1 - i - j, 0, c);
        for (let k = 0; k < h; k++) {
          state.cubes[makeId()] = { i, j, k };
        }
      }
    }
    return state;
  }
  // Random walk: add and remove cubes at random, biased towards adding
  // so the box fills up to roughly half.
  const rand = mulberry32(seed);
  const target = (a * b * c) / 2;
  for (let step = 0; step < a * b * c * 8; step++) {
    const count = Object.keys(state.cubes).length;
    const addable = addablePositions(state);
    const removable = removableCubeIds(state);
    const wantAdd = rand() < (count < target ? 0.8 : 0.4);
    if (wantAdd && addable.length > 0) {
      const pos = addable[Math.floor(rand() * addable.length)];
      state = produce(state, (draft) => {
        draft.cubes[makeId()] = pos;
      });
    } else if (removable.length > 0) {
      const id = removable[Math.floor(rand() * removable.length)];
      state = produce(state, (draft) => {
        delete draft.cubes[id];
      });
    }
  }
  return state;
}

// # Geometry

const S = 30; // edge length of a cube, in pixels

// Isometric axes: i goes down-right, j goes down-left, k goes up.
const EI = Vec2(Math.sqrt(3) / 2, 0.5).mul(S);
const EJ = Vec2(-Math.sqrt(3) / 2, 0.5).mul(S);
const EK = Vec2(0, -1).mul(S);

function proj(i: number, j: number, k: number): Vec2 {
  return EI.mul(i).add(EJ.mul(j)).add(EK.mul(k));
}

function lozenge(...pts: [number, number, number][]): string {
  return path("M", ...pts.map((p) => proj(...p)), "Z");
}

// The three lozenge orientations get the three classic colors. Top
// faces of cubes match the floor; the cube's two visible side faces
// match the two walls with the same orientation.
const FACE_TOP = "#f6d55c";
const FACE_I = "#3caea3"; // faces perpendicular to i (left wall, cube's right-front face)
const FACE_J = "#ed553b"; // faces perpendicular to j (right wall, cube's left-front face)
const EDGE = "#333";

const SPARE_GAP = 60;

function layout(a: number, b: number, c: number) {
  const left = -b * (Math.sqrt(3) / 2) * S;
  const right = a * (Math.sqrt(3) / 2) * S;
  const top = -c * S;
  const bottom = ((a + b) / 2) * S;
  const margin = 24;
  const spareX = right + SPARE_GAP + S;
  return {
    origin: Vec2(margin - left, margin - top),
    width: spareX - left + Math.sqrt(3) * S + 2 * margin,
    height: bottom - top + 2 * margin,
    spare: Vec2(spareX, (top + bottom) / 2 + S / 2),
  };
}

function drawCubeFaces(ghost = false) {
  // Ghosts (addable positions) are a white wash with dashed edges.
  const faceProps = ghost
    ? {
        fill: "white",
        fillOpacity: 0.45,
        stroke: EDGE,
        strokeDasharray: "3,3",
        strokeLinejoin: "round" as const,
      }
    : { stroke: EDGE, strokeLinejoin: "round" as const };
  return (
    <g>
      <path
        d={lozenge([0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1])}
        fill={FACE_TOP}
        {...faceProps}
      />
      <path
        d={lozenge([1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1])}
        fill={FACE_I}
        {...faceProps}
      />
      <path
        d={lozenge([0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1])}
        fill={FACE_J}
        {...faceProps}
      />
    </g>
  );
}

function drawBox(a: number, b: number, c: number) {
  return (
    <g id="box" dragologyZIndex={-1}>
      {/* floor */}
      {_.range(a).map((i) =>
        _.range(b).map((j) => (
          <path
            d={lozenge(
              [i, j, 0],
              [i + 1, j, 0],
              [i + 1, j + 1, 0],
              [i, j + 1, 0],
            )}
            fill={FACE_TOP}
            stroke={EDGE}
            strokeLinejoin="round"
          />
        )),
      )}
      {/* left wall (i = 0) */}
      {_.range(b).map((j) =>
        _.range(c).map((k) => (
          <path
            d={lozenge(
              [0, j, k],
              [0, j + 1, k],
              [0, j + 1, k + 1],
              [0, j, k + 1],
            )}
            fill={FACE_I}
            stroke={EDGE}
            strokeLinejoin="round"
          />
        )),
      )}
      {/* right wall (j = 0) */}
      {_.range(a).map((i) =>
        _.range(c).map((k) => (
          <path
            d={lozenge(
              [i, 0, k],
              [i + 1, 0, k],
              [i + 1, 0, k + 1],
              [i, 0, k + 1],
            )}
            fill={FACE_J}
            stroke={EDGE}
            strokeLinejoin="round"
          />
        )),
      )}
    </g>
  );
}

// # Draggable

function makeDraggable(config: Config): Draggable<State> {
  return ({ state, d, draggedId }) => {
    const { a, b, c } = state;
    const { origin, spare } = layout(a, b, c);
    const removable = new Set(removableCubeIds(state));
    const addable = addablePositions(state);

    return (
      <g transform={translate(origin)}>
        {drawBox(a, b, c)}

        {/* Cubes, back to front */}
        {_.sortBy(
          Object.entries(state.cubes),
          ([, { i, j, k }]) => i + j + k,
        ).map(([id, { i, j, k }]) => {
          const elementId = `cube-${id}`;
          const isRemovable = removable.has(id);
          return (
            <g
              id={elementId}
              transform={translate(proj(i, j, k))}
              dragologyZIndex={draggedId === elementId ? "/1" : 1 + i + j + k}
              style={{ cursor: isRemovable ? "grab" : undefined }}
              dragologyOnDrag={
                isRemovable &&
                (() => {
                  const without = produce(state, (draft) => {
                    delete draft.cubes[id];
                  });
                  // Every place this cube could go, including back where it was.
                  const targets = addablePositions(without).map((pos) =>
                    produce(without, (draft) => {
                      draft.cubes[id] = pos;
                    }),
                  );
                  return d
                    .closest([
                      d.closest(targets).withFloating(),
                      // No floating here, so the cube visibly vanishes
                      // when it's over the spare pile.
                      d.dropTarget("spare-bin", without),
                    ])
                    .whenFar(d.fixed(state).withFloating());
                })
              }
            >
              {drawCubeFaces()}
              {config.showHints && isRemovable && (
                <circle
                  transform={translate(proj(0.5, 0.5, 1))}
                  r={3}
                  fill={EDGE}
                  opacity={0.5}
                />
              )}
            </g>
          );
        })}

        {/* Addable positions */}
        {config.showHints && (
          <g id="hints" dragologyZIndex={1000}>
            {addable.map(({ i, j, k }) => (
              <g
                id={`hint-${i}-${j}-${k}`}
                transform={translate(proj(i, j, k))}
                pointerEvents="none"
              >
                {drawCubeFaces(true)}
              </g>
            ))}
          </g>
        )}

        {/* Spare pile: a bottomless supply of cubes, and a place to
            drop cubes you've taken out. */}
        <g id="spare-bin" transform={translate(spare)}>
          <ellipse
            cx={0}
            cy={S / 2}
            rx={S * 1.3}
            ry={S * 0.75}
            fill="#f5f5f5"
            stroke="#bbb"
            strokeDasharray="4,4"
          />
          <text
            x={0}
            y={S * 1.75}
            textAnchor="middle"
            fontSize={11}
            fill="#888"
            pointerEvents="none"
          >
            spare cubes
          </text>
          <g
            id="spare-cube"
            transform={translate(0, 0)}
            style={{ cursor: addable.length > 0 ? "grab" : "not-allowed" }}
            dragologyOnDrag={
              addable.length > 0 &&
              (() => {
                const newId = makeId();
                const withCubeAt = (pos: Cube) =>
                  produce(state, (draft) => {
                    draft.cubes[newId] = pos;
                  });
                return d.switchToStateAndFollow(
                  withCubeAt(addable[0]),
                  `cube-${newId}`,
                  d
                    .closest(addable.map(withCubeAt))
                    .withFloating()
                    // Far from any spot, the new cube floats but the
                    // pile shows the original state; drop there and
                    // it goes back to the spare pile.
                    .whenFar(d.fixed(state).withFloating()),
                );
              })
            }
          >
            {drawCubeFaces()}
          </g>
        </g>
      </g>
    );
  };
}

// # Component

export default demo(
  () => {
    const [config, setConfig] = useState(defaultConfig);
    const draggable = useMemo(() => makeDraggable(config), [config]);
    const initialState = useMemo(() => makeInitialState(config), [config]);
    const { width, height } = layout(config.a, config.b, config.c);

    return (
      <DemoWithConfig>
        <div>
          <DemoNotes>
            A{" "}
            <DemoLink href="https://en.wikipedia.org/wiki/Plane_partition">
              plane partition
            </DemoLink>{" "}
            is a stack of cubes in the corner of a box – and, seen flat, it is a
            lozenge tiling of a hexagon. Drag a corner cube to move it or to
            toss it in the spare pile; drag a spare cube into any inner corner.
            Each move is one "flip" of the tiling. See also{" "}
            <DemoLink href="#/demos/aztec-diamond">aztec-diamond</DemoLink>, the
            domino cousin of this demo.
          </DemoNotes>
          <DemoDraggable
            key={`${config.a}-${config.b}-${config.c}-${config.seed}`}
            draggable={draggable}
            initialState={initialState}
            width={width}
            height={height}
          />
        </div>
        <ConfigPanel>
          <ConfigSlider
            label="a"
            value={config.a}
            onChange={(a) => setConfig((c) => ({ ...c, a }))}
            min={1}
            max={6}
          />
          <ConfigSlider
            label="b"
            value={config.b}
            onChange={(b) => setConfig((c) => ({ ...c, b }))}
            min={1}
            max={6}
          />
          <ConfigSlider
            label="c"
            value={config.c}
            onChange={(v) => setConfig((c) => ({ ...c, c: v }))}
            min={1}
            max={6}
          />
          <ConfigCheckbox
            label="Show hints"
            value={config.showHints}
            onChange={(showHints) => setConfig((c) => ({ ...c, showHints }))}
          />
          <div className="flex gap-2">
            <button
              className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-sm"
              onClick={() =>
                setConfig((c) => ({
                  ...c,
                  seed: 1 + Math.floor(Math.random() * 1e9),
                }))
              }
            >
              Randomize
            </button>
            <button
              className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-sm"
              onClick={() => setConfig((c) => ({ ...c, seed: 0 }))}
            >
              Reset
            </button>
          </div>
        </ConfigPanel>
      </DemoWithConfig>
    );
  },
  {
    tags: [
      "d.closest",
      "d.dropTarget",
      "d.fixed",
      "d.switchToStateAndFollow",
      "spec.whenFar",
      "spec.withFloating",
      "tiling",
    ],
  },
);
