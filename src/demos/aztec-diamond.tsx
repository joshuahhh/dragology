import { interpolateRgb } from "d3-interpolate";
import { produce } from "immer";
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
import { rotateDeg, translate } from "../svgx/helpers";
import { makeId } from "../utils";

// Domino tilings of the Aztec diamond. Any two tilings are connected
// by "flips": find two parallel dominoes forming a 2×2 block and
// rotate the block by 90°. Here you drag one domino of such a block;
// the pair rotates as you drag, snaps into the flipped position, and
// (thanks to chaining) you can keep going with the next flip without
// letting go.
//
// Overlaid is Thurston's height function on the grid vertices. A flip
// changes the height at just one vertex (the center of the block) by
// ±4, so the height function is a landscape that you sculpt one
// vertex at a time.

// # State

type Orientation = "h" | "v";

/** (x, y) is the lower-left cell (in y-up math coordinates). "h"
 * covers (x, y) and (x+1, y); "v" covers (x, y) and (x, y+1). */
type Domino = { x: number; y: number; o: Orientation };

type State = {
  n: number;
  dominoes: Record<string, Domino>;
};

type Config = {
  n: number;
  seed: number;
  showHeights: boolean;
  highlightFlippable: boolean;
};

const defaultConfig: Config = {
  n: 4,
  seed: 0,
  showHeights: true,
  highlightFlippable: true,
};

// # Aztec diamond geometry

/** Is cell (x, y) (lower-left corner coordinates) in the diamond of order n? */
function inDiamond(n: number, x: number, y: number): boolean {
  return Math.abs(x + 0.5) + Math.abs(y + 0.5) <= n;
}

function cells(n: number): [number, number][] {
  const result: [number, number][] = [];
  for (let x = -n; x < n; x++) {
    for (let y = -n; y < n; y++) {
      if (inDiamond(n, x, y)) result.push([x, y]);
    }
  }
  return result;
}

function cellsOf({ x, y, o }: Domino): [number, number][] {
  return o === "h"
    ? [
        [x, y],
        [x + 1, y],
      ]
    : [
        [x, y],
        [x, y + 1],
      ];
}

const cellKey = (x: number, y: number) => `${x},${y}`;

/** Map from cell key to the id of the domino covering it. */
function coverage(state: State): Map<string, string> {
  const map = new Map<string, string>();
  for (const [id, dom] of Object.entries(state.dominoes)) {
    for (const [x, y] of cellsOf(dom)) map.set(cellKey(x, y), id);
  }
  return map;
}

function allHorizontal(n: number): State {
  const dominoes: Record<string, Domino> = {};
  for (const [x, y] of cells(n)) {
    // Each row's leftmost cell has x = -w; pair up cells left-to-right.
    const w = n - Math.abs(y + 0.5) + 0.5;
    if ((x + w) % 2 === 0) dominoes[makeId()] = { x, y, o: "h" };
  }
  return { n, dominoes };
}

function allVertical(n: number): State {
  const dominoes: Record<string, Domino> = {};
  for (const [x, y] of cells(n)) {
    const w = n - Math.abs(x + 0.5) + 0.5;
    if ((y + w) % 2 === 0) dominoes[makeId()] = { x, y, o: "v" };
  }
  return { n, dominoes };
}

// # Flips

/** States reachable by one flip involving the given domino. The
 * convention: the top/left domino of the block becomes the left/top
 * one, so the block rigidly rotates by a quarter turn. */
function flipsInvolving(state: State, id: string): State[] {
  const cov = coverage(state);
  const dom = state.dominoes[id];
  const partnerAt = (x: number, y: number, o: Orientation) => {
    const pid = cov.get(cellKey(x, y));
    if (pid === undefined || pid === id) return undefined;
    const p = state.dominoes[pid];
    return p.x === x && p.y === y && p.o === o ? pid : undefined;
  };
  const flipTo = (pid: string, mine: Domino, theirs: Domino): State =>
    produce(state, (draft) => {
      draft.dominoes[id] = mine;
      draft.dominoes[pid] = theirs;
    });

  const { x, y } = dom;
  const result: State[] = [];
  if (dom.o === "h") {
    // partner above: I'm the bottom one → I become the right one
    const above = partnerAt(x, y + 1, "h");
    if (above)
      result.push(flipTo(above, { x: x + 1, y, o: "v" }, { x, y, o: "v" }));
    // partner below: I'm the top one → I become the left one
    const below = partnerAt(x, y - 1, "h");
    if (below)
      result.push(
        flipTo(below, { x, y: y - 1, o: "v" }, { x: x + 1, y: y - 1, o: "v" }),
      );
  } else {
    // partner to the right: I'm the left one → I become the top one
    const right = partnerAt(x + 1, y, "v");
    if (right)
      result.push(flipTo(right, { x, y: y + 1, o: "h" }, { x, y, o: "h" }));
    // partner to the left: I'm the right one → I become the bottom one
    const left = partnerAt(x - 1, y, "v");
    if (left)
      result.push(
        flipTo(left, { x: x - 1, y, o: "h" }, { x: x - 1, y: y + 1, o: "h" }),
      );
  }
  return result;
}

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

function makeInitialState({ n, seed }: Config): State {
  let state = allHorizontal(n);
  if (seed === 0) return state;
  const rand = mulberry32(seed);
  const ids = Object.keys(state.dominoes);
  for (let step = 0; step < n * n * 40; step++) {
    const id = ids[Math.floor(rand() * ids.length)];
    const flips = flipsInvolving(state, id);
    if (flips.length > 0) state = flips[Math.floor(rand() * flips.length)];
  }
  return state;
}

// # Height function

/** Thurston's height function on the vertices of the diamond. Walking
 * along a grid edge with a black cell on your left, the height goes
 * up by 1 – unless a domino straddles that edge, in which case it
 * goes down by 3. Returned as a map from vertex key to height. */
function heightFunction(state: State): Map<string, number> {
  const { n } = state;
  const cov = coverage(state);
  const isBlack = (x: number, y: number) => (x + y) % 2 === 0;
  const heights = new Map<string, number>();
  const start: [number, number] = [-n, 0];
  heights.set(cellKey(...start), 0);
  const queue: [number, number][] = [start];
  const dirs: [number, number][] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    const h = heights.get(cellKey(x, y))!;
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      // The cells on either side of this edge (lower-left corners).
      const mid = Vec2(x + dx / 2, y + dy / 2);
      const leftCenter = mid.add(Vec2(-dy, dx).mul(0.5));
      const rightCenter = mid.add(Vec2(dy, -dx).mul(0.5));
      const lc: [number, number] = [leftCenter.x - 0.5, leftCenter.y - 0.5];
      const rc: [number, number] = [rightCenter.x - 0.5, rightCenter.y - 0.5];
      const lIn = inDiamond(n, ...lc);
      const rIn = inDiamond(n, ...rc);
      if (!lIn && !rIn) continue; // edge not in the region
      const crossed =
        lIn && rIn && cov.get(cellKey(...lc)) === cov.get(cellKey(...rc));
      const sign = isBlack(...lc) ? 1 : -1;
      const nh = h + sign * (crossed ? -3 : 1);
      const key = cellKey(nx, ny);
      if (!heights.has(key)) {
        heights.set(key, nh);
        queue.push([nx, ny]);
      }
    }
  }
  return heights;
}

// # Rendering

const CELL = 32;
const INSET = 2;

// The four domino types (orientation × color of the lower-left cell),
// as in the classic pictures of the arctic circle.
const DOMINO_COLORS = {
  "h-black": "#e63946",
  "h-white": "#f4a261",
  "v-black": "#457b9d",
  "v-white": "#2a9d8f",
};

const heightColor = interpolateRgb("#e0f2fe", "#1e3a8a");

/** Screen position of the math-coordinate point (x, y). */
function screen(x: number, y: number): Vec2 {
  return Vec2(x * CELL, -y * CELL);
}

function dominoCenter({ x, y, o }: Domino): Vec2 {
  return o === "h" ? screen(x + 1, y + 0.5) : screen(x + 0.5, y + 1);
}

function makeDraggable(config: Config): Draggable<State> {
  // Height extremes for coloring: the all-horizontal and all-vertical
  // tilings are the extreme tilings, and every tiling's height at a
  // vertex sits between theirs.
  const hMinMax = (() => {
    const hA = heightFunction(allHorizontal(config.n));
    const hB = heightFunction(allVertical(config.n));
    const result = new Map<string, [number, number]>();
    for (const [key, a] of hA) {
      const b = hB.get(key)!;
      result.set(key, [Math.min(a, b), Math.max(a, b)]);
    }
    return result;
  })();

  return ({ state, d, draggedId }) => {
    const { n } = state;
    const origin = Vec2((n + 0.5) * CELL, (n + 0.5) * CELL);
    const heights = config.showHeights ? heightFunction(state) : null;

    return (
      <g transform={translate(origin)}>
        {/* Checkerboard */}
        <g id="board" dragologyZIndex={-1}>
          {cells(n).map(([x, y]) => (
            <rect
              transform={translate(screen(x, y + 1))}
              width={CELL}
              height={CELL}
              fill={(x + y) % 2 === 0 ? "#e5e7eb" : "#f9fafb"}
            />
          ))}
        </g>

        {/* Dominoes */}
        {Object.entries(state.dominoes).map(([id, dom]) => {
          const elementId = `domino-${id}`;
          const flips = flipsInvolving(state, id);
          const flippable = flips.length > 0;
          const colorKey = `${dom.o}-${
            (dom.x + dom.y) % 2 === 0 ? "black" : "white"
          }` as keyof typeof DOMINO_COLORS;
          return (
            <g
              id={elementId}
              transform={
                translate(dominoCenter(dom)) +
                rotateDeg(dom.o === "h" ? 0 : -90)
              }
              dragologyZIndex={draggedId === elementId ? "/1" : false}
              style={{ cursor: flippable ? "grab" : undefined }}
              dragologyOnDrag={
                flippable &&
                (() =>
                  d
                    .closest(
                      flips.map((flipped) => d.between([state, flipped])),
                    )
                    .withSnapRadius(8, { chain: true }))
              }
            >
              <rect
                x={-CELL + INSET}
                y={-CELL / 2 + INSET}
                width={2 * CELL - 2 * INSET}
                height={CELL - 2 * INSET}
                rx={4}
                fill={DOMINO_COLORS[colorKey]}
                stroke="#1f2937"
                strokeWidth={1}
                opacity={config.highlightFlippable && !flippable ? 0.45 : 1}
              />
            </g>
          );
        })}

        {/* Height function */}
        {heights && (
          <g id="heights" dragologyZIndex={10} pointerEvents="none">
            {[...heights.entries()].map(([key, h]) => {
              const [x, y] = key.split(",").map(Number);
              const [lo, hi] = hMinMax.get(key)!;
              const frac = hi === lo ? 0 : (h - lo) / (hi - lo);
              return (
                <g
                  id={`vertex-${x + n}-${y + n}`}
                  transform={translate(screen(x, y))}
                >
                  <circle
                    r={8}
                    fill={heightColor(frac)}
                    stroke="white"
                    strokeWidth={1.5}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={9}
                    fontFamily="ui-monospace, monospace"
                    fill={frac > 0.5 ? "white" : "#1e3a8a"}
                  >
                    {h}
                  </text>
                </g>
              );
            })}
          </g>
        )}
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
    const size = (2 * config.n + 1) * CELL;

    return (
      <DemoWithConfig>
        <div>
          <DemoNotes>
            Domino tilings of the{" "}
            <DemoLink href="https://en.wikipedia.org/wiki/Aztec_diamond">
              Aztec diamond
            </DemoLink>
            . Two parallel dominoes side by side form a 2×2 block; drag one of
            them to rotate the block. Keep dragging to chain flips. The numbers
            are Thurston's height function – each flip changes it at exactly one
            vertex.
          </DemoNotes>
          <DemoDraggable
            key={`${config.n}-${config.seed}`}
            draggable={draggable}
            initialState={initialState}
            width={size}
            height={size}
          />
        </div>
        <ConfigPanel>
          <ConfigSlider
            label="Order"
            value={config.n}
            onChange={(n) => setConfig((c) => ({ ...c, n }))}
            min={1}
            max={8}
          />
          <ConfigCheckbox
            label="Show height function"
            value={config.showHeights}
            onChange={(showHeights) =>
              setConfig((c) => ({ ...c, showHeights }))
            }
          />
          <ConfigCheckbox
            label="Dim stuck dominoes"
            value={config.highlightFlippable}
            onChange={(highlightFlippable) =>
              setConfig((c) => ({ ...c, highlightFlippable }))
            }
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
              Shuffle
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
    tags: ["d.between", "d.closest", "spec.withSnapRadius [chain]", "tiling"],
  },
);
