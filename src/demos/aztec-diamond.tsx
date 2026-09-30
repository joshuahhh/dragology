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
import { inOrder } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { rotateDeg, translate } from "../svgx/helpers";
import { makeId } from "../utils";

// Domino tilings of the Aztec diamond. Any two tilings are connected
// by "flips": find two parallel dominoes forming a 2×2 block and
// rotate the block by 90°. Here you grab one domino of such a block
// and turn the block like a knob: the pair rotates rigidly about the
// block's center (a `d.vary` on the turn angle), and on release it
// settles to the nearest quarter turn – either way round, or back.
//
// Overlaid is Thurston's height function on the grid vertices. A flip
// changes the height at just one vertex (the center of the block) by
// ±4, so the height function is a landscape that you sculpt one
// vertex at a time.

// # State

type Orientation = "h" | "v";

/** (x, y) is the lower-left cell (in y-up math coordinates). `angle`
 * is the domino's rotation in SVG degrees, always a multiple of 90
 * and never normalized, so that consecutive flips interpolate as
 * quarter turns in the direction they were made. Multiples of 180
 * are horizontal ("h": covers (x, y) and (x+1, y)); the rest are
 * vertical ("v": covers (x, y) and (x, y+1)). */
type Domino = { x: number; y: number; angle: number };

function orientation(dom: Domino): Orientation {
  return dom.angle % 180 === 0 ? "h" : "v";
}

/** A 2×2 block (lower-left cell (bx, by)) being turned by `spin`
 * degrees (SVG convention: positive is clockwise on screen). Only
 * exists mid-drag; dropping settles it into the dominoes. */
type Turn = { bx: number; by: number; ids: [string, string]; spin: number };

type State = {
  n: number;
  dominoes: Record<string, Domino>;
  turn: Turn | null;
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

function cellsOf(dom: Domino): [number, number][] {
  const { x, y } = dom;
  return orientation(dom) === "h"
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
    if ((x + w) % 2 === 0) dominoes[makeId()] = { x, y, angle: 0 };
  }
  return { n, dominoes, turn: null };
}

function allVertical(n: number): State {
  const dominoes: Record<string, Domino> = {};
  for (const [x, y] of cells(n)) {
    const w = n - Math.abs(x + 0.5) + 0.5;
    if ((y + w) % 2 === 0) dominoes[makeId()] = { x, y, angle: 90 };
  }
  return { n, dominoes, turn: null };
}

// # Flips

/** The 2×2 blocks the given domino forms with a parallel neighbor
 * (0, 1 or 2 of them), as lower-left cell plus partner id. */
function blocksOf(
  state: State,
  id: string,
  cov: Map<string, string> = coverage(state),
): { bx: number; by: number; pid: string }[] {
  const dom = state.dominoes[id];
  const o = orientation(dom);
  const partnerAt = (x: number, y: number) => {
    const pid = cov.get(cellKey(x, y));
    if (pid === undefined || pid === id) return undefined;
    const p = state.dominoes[pid];
    return p.x === x && p.y === y && orientation(p) === o ? pid : undefined;
  };
  const { x, y } = dom;
  const candidates: [number, number, string | undefined][] =
    o === "h"
      ? [
          [x, y, partnerAt(x, y + 1)],
          [x, y - 1, partnerAt(x, y - 1)],
        ]
      : [
          [x, y, partnerAt(x + 1, y)],
          [x - 1, y, partnerAt(x - 1, y)],
        ];
  return candidates
    .filter(([, , pid]) => pid !== undefined)
    .map(([bx, by, pid]) => ({ bx, by, pid: pid! }));
}

function blockCenter(bx: number, by: number): Vec2 {
  return screen(bx + 1, by + 1);
}

/** Rotate the turn's two dominoes rigidly about the block center by
 * `spin` (a multiple of 90) and write them back as plain dominoes. */
function applyTurn(state: State, turn: Turn, spin: number): State {
  const bc = blockCenter(turn.bx, turn.by);
  return produce(state, (draft) => {
    for (const id of turn.ids) {
      const dom = state.dominoes[id];
      const c = dominoCenter(dom).sub(bc).rotateDeg(spin).add(bc);
      const angle = dom.angle + spin;
      const mx = c.x / CELL;
      const my = -c.y / CELL;
      const h = orientation({ x: 0, y: 0, angle }) === "h";
      draft.dominoes[id] = {
        x: Math.round(h ? mx - 1 : mx - 0.5),
        y: Math.round(h ? my - 0.5 : my - 1),
        angle,
      };
    }
    draft.turn = null;
  });
}

/** Settle an in-progress turn to the nearest quarter turn. */
function settle(state: State): State {
  const { turn } = state;
  if (!turn) return state;
  return applyTurn(state, turn, Math.round(turn.spin / 90) * 90);
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
    const blocks = blocksOf(state, id);
    if (blocks.length === 0) continue;
    const { bx, by, pid } = blocks[Math.floor(rand() * blocks.length)];
    const spin = rand() < 0.5 ? 90 : -90;
    state = applyTurn(state, { bx, by, ids: [id, pid], spin: 0 }, spin);
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

function dominoCenter(dom: Domino): Vec2 {
  const { x, y } = dom;
  return orientation(dom) === "h"
    ? screen(x + 1, y + 0.5)
    : screen(x + 0.5, y + 1);
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

  const n = config.n;

  // Checkerboard, as two paths (one per color) to keep the element
  // count down, built once.
  const board = (
    <g id="board" dragologyZIndex={-1}>
      {[0, 1].map((parity) => (
        <path
          d={cells(n)
            .filter(([x, y]) => (((x + y) % 2) + 2) % 2 === parity)
            .map(([x, y]) => {
              const p = screen(x, y + 1);
              return `M${p.x},${p.y}h${CELL}v${CELL}h${-CELL}Z`;
            })
            .join("")}
          fill={parity === 0 ? "#e5e7eb" : "#f9fafb"}
        />
      ))}
    </g>
  );

  // Everything that depends only on the tiling the diagram would
  // settle to if dropped now: colors, flippability, and the height
  // overlay. d.vary re-renders the diagram many times per frame, but
  // during one drag there are only three settled tilings (turned
  // -90, 0 or +90), so we cache these per (dominoes object, turn,
  // rounded spin) and each render only computes transforms.
  type Derived = {
    colorKey: Record<string, keyof typeof DOMINO_COLORS>;
    flippable: Record<string, boolean>;
    heightsEl: ReturnType<typeof drawHeights> | null;
  };
  const cache = new WeakMap<object, Map<string, Derived>>();
  function derive(state: State): Derived {
    const { turn } = state;
    const key = turn
      ? `${turn.bx},${turn.by},${turn.ids.join(",")},${Math.round(turn.spin / 90)}`
      : "";
    let byTurn = cache.get(state.dominoes);
    if (!byTurn) cache.set(state.dominoes, (byTurn = new Map()));
    const hit = byTurn.get(key);
    if (hit) return hit;

    const settled = settle(state);
    const cov = coverage(settled);
    const colorKey: Derived["colorKey"] = {};
    const flippable: Derived["flippable"] = {};
    for (const [id, dom] of Object.entries(settled.dominoes)) {
      colorKey[id] = `${orientation(dom)}-${
        (dom.x + dom.y) % 2 === 0 ? "black" : "white"
      }`;
      flippable[id] = blocksOf(settled, id, cov).length > 0;
    }
    const derived: Derived = {
      colorKey,
      flippable,
      heightsEl: config.showHeights
        ? drawHeights(heightFunction(settled))
        : null,
    };
    byTurn.set(key, derived);
    return derived;
  }

  function drawHeights(heights: Map<string, number>) {
    return (
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
    );
  }

  const origin = Vec2((n + 0.5) * CELL, (n + 0.5) * CELL);

  return ({ state, d, draggedId }) => {
    const { colorKey, flippable: flippableById, heightsEl } = derive(state);
    const { turn } = state;

    return (
      <g transform={translate(origin)}>
        {board}

        {/* Dominoes */}
        {Object.entries(state.dominoes).map(([id, dom]) => {
          const elementId = `domino-${id}`;
          const flippable = flippableById[id];
          // Every domino is drawn as translate(pivot) rotate(spin)
          // translate(offset), so transforms lerp component-wise
          // between turning and settled states. At rest the pivot is
          // the domino's own center; while turning it's the block
          // center, which makes the pair rotate rigidly. The rotation
          // is on the dragged element itself, so the grab point turns
          // with the domino and d.vary makes it follow the pointer.
          const inTurn = !!turn && turn.ids.includes(id);
          const c = dominoCenter(dom);
          const pivot = inTurn ? blockCenter(turn.bx, turn.by) : c;
          return (
            <g
              id={elementId}
              transform={
                translate(pivot) +
                rotateDeg(inTurn ? turn.spin : 0) +
                translate(c.sub(pivot))
              }
              dragologyZIndex={
                draggedId === elementId ? "/1" : inTurn ? 1 : false
              }
              style={{ cursor: flippable ? "grab" : undefined }}
              dragologyOnDrag={
                flippable &&
                (() => {
                  const base = settle(state);
                  return d
                    .closest(
                      blocksOf(base, id).map(({ bx, by, pid }) =>
                        d.varyFunc(
                          [0],
                          ([spin]) => ({
                            ...base,
                            turn: { bx, by, ids: [id, pid], spin },
                          }),
                          {
                            constraint: (s) => inOrder([-90, s.turn!.spin, 90]),
                          },
                        ),
                      ),
                    )
                    .onDrop(settle);
                })
              }
            >
              <g transform={rotateDeg(dom.angle)}>
                <rect
                  x={-CELL + INSET}
                  y={-CELL / 2 + INSET}
                  width={2 * CELL - 2 * INSET}
                  height={CELL - 2 * INSET}
                  rx={4}
                  fill={DOMINO_COLORS[colorKey[id]]}
                  stroke="#1f2937"
                  strokeWidth={1}
                  opacity={config.highlightFlippable && !flippable ? 0.45 : 1}
                />
              </g>
            </g>
          );
        })}

        {/* Height function */}
        {heightsEl}
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
            them to turn the block like a knob, either way round; let go and it
            settles to the nearest quarter turn. The numbers are Thurston's
            height function – each flip changes it at exactly one vertex. See
            also{" "}
            <DemoLink href="#/demos/plane-partition">plane-partition</DemoLink>,
            the lozenge cousin of this demo.
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
    tags: ["d.varyFunc", "d.closest", "spec.onDrop", "tiling"],
  },
);
