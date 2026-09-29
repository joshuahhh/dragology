import _ from "lodash";
import { useState } from "react";
import { amb, produceAmb } from "../amb";
import { arrowhead } from "../arrows";
import { demo } from "../demo";
import {
  ConfigRadio,
  ConfigSelect,
  DemoDraggable,
  DemoNotes,
} from "../demo/ui";
import { Draggable } from "../draggable";
import { Vec2 } from "../math/vec2";
import { Svgx } from "../svgx";
import { translate } from "../svgx/helpers";

// # Permutation Lab
//
// One permutation π ∈ S_n, shown five ways, all draggable and kept in
// sync. The state is a *word* in the adjacent transpositions
// s_0 … s_{n-2}; π is derived from it. This makes the wiring diagram
// (which literally draws the word) the primary object, and lets braid
// moves change the word without changing π. Words written by
// adjacent-mode drags are literal (every step appends a letter, so
// they needn't be reduced); words recomputed after other drags are
// reduced.
//
// Convention: letters act on *positions*. Applying s_i to a one-line
// array swaps entries i and i+1. So `permFromWord` starts from the
// identity and applies the letters left to right; the result is the
// one-line notation of π (perm[i] = π(i+1), values 1-indexed).

type Mode = "free" | "adjacent";

/** A letter s_i, or `null` for a blank column. Blank columns only exist
 * mid-drag: cancelling s_i s_i first empties the two columns (so nothing
 * to the right shifts while you drag), then the drop compacts them. */
type Letter = number | null;

/** What the state's word actually stores: letters, blank columns, and
 * "closed" columns. A closed column is a blank that has been cancelled:
 * it draws with zero width, so the drop animation after a cancel is a
 * plain horizontal slide of everything to its right (the wire paths keep
 * the same column structure). Closed columns are dropped from the
 * logical word as soon as the next interaction builds a new state. */
type Col = Letter | "closed";

type State = {
  n: number;
  word: Col[];
  mode: Mode;
};

// ## Permutation math

function permFromWord(n: number, word: Letter[]): number[] {
  const arr = _.range(1, n + 1);
  for (const i of word) {
    if (i === null) continue;
    [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
  }
  return arr;
}

function inversions(perm: number[]): number {
  let count = 0;
  for (let i = 0; i < perm.length; i++) {
    for (let j = i + 1; j < perm.length; j++) {
      if (perm[i] > perm[j]) count++;
    }
  }
  return count;
}

/** A reduced word for `perm`, via bubble sort (each swap fixes exactly
 * one inversion, so the word's length equals the inversion count). */
function wordFromPerm(perm: number[]): number[] {
  const arr = perm.slice();
  const swaps: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] > arr[i + 1]) {
        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        swaps.push(i);
        changed = true;
      }
    }
  }
  // perm · s_{j1} ⋯ s_{jm} = id, so perm = s_{jm} ⋯ s_{j1}.
  return swaps.reverse();
}

/** Multiply the word on the right by s_i: literally append the letter,
 * even if that makes the word non-reduced (e.g. dragging a tile right
 * and then back left writes s_i s_i). */
function applyGenerator(word: Letter[], i: number): Letter[] {
  return [...word, i];
}

/** Cycles of π, each starting at its smallest element, sorted by that
 * element. Fixed points are included as 1-cycles. */
function cyclesOf(perm: number[]): number[][] {
  const seen = new Set<number>();
  const cycles: number[][] = [];
  for (let v = 1; v <= perm.length; v++) {
    if (seen.has(v)) continue;
    const cyc: number[] = [];
    let x = v;
    while (!seen.has(x)) {
      seen.add(x);
      cyc.push(x);
      x = perm[x - 1];
    }
    cycles.push(cyc);
  }
  return cycles;
}

function permFromCycles(n: number, cycles: number[][]): number[] {
  const perm = _.range(1, n + 1);
  for (const cyc of cycles) {
    cyc.forEach((v, k) => {
      perm[v - 1] = cyc[(k + 1) % cyc.length];
    });
  }
  return perm;
}

/** Words reachable from `word` by one Coxeter relation that moves the
 * crossing at column `j`: a commutation s_i s_k = s_k s_i (|i−k| ≥ 2)
 * with a neighbor, or a braid move s_i s_k s_i = s_k s_i s_k (|i−k| = 1).
 * In a braid move the dragged crossing is either an end (it jumps two
 * columns across the third strand) or the middle (it moves one row
 * vertically). */
function crossingMoves(word: Letter[], j: number): Letter[][] {
  const i = word[j];
  if (i === null) return [];
  const at = (k: number): Letter =>
    k >= 0 && k < word.length ? word[k] : null;
  const commutes = (k: number) => {
    const l = at(k);
    return l !== null && Math.abs(l - i) >= 2;
  };
  const isBraid = (start: number) => {
    const a = at(start);
    const b = at(start + 1);
    return (
      a !== null && b !== null && at(start + 2) === a && Math.abs(a - b) === 1
    );
  };
  const swapped = (a: number, b: number) => {
    const w = word.slice();
    [w[a], w[b]] = [w[b], w[a]];
    return w;
  };
  const braidAt = (start: number) => {
    const a = word[start];
    const b = word[start + 1];
    const w = word.slice();
    w[start] = b;
    w[start + 1] = a;
    w[start + 2] = b;
    return w;
  };
  const moves: Letter[][] = [];
  if (commutes(j - 1)) moves.push(swapped(j - 1, j));
  if (isBraid(j - 2)) moves.push(braidAt(j - 2)); // dragged = right end
  if (commutes(j + 1)) moves.push(swapped(j, j + 1));
  if (isBraid(j)) moves.push(braidAt(j)); // dragged = left end
  if (isBraid(j - 1)) moves.push(braidAt(j - 1)); // dragged = middle
  return moves;
}

// ## Permutohedron layout
//
// Vertices are the permutations of {1..n} as points in R^n (centered);
// edges join permutations differing by an adjacent transposition. For
// n = 3 that's a hexagon in a plane; for n = 4 it's a truncated
// octahedron in a 3-space, which we draw as a Schlegel diagram (a
// perspective projection from just outside one hexagonal face).

type PermutohedronLayout = {
  pos: Map<string, Vec2>; // unit-radius coords keyed by one-line string
  edges: [string, string][];
};

const permKey = (perm: number[]) => perm.join("");

const permutohedronLayouts = new Map<number, PermutohedronLayout>();

function permutohedronLayout(n: number): PermutohedronLayout {
  const cached = permutohedronLayouts.get(n);
  if (cached) return cached;
  const dot = (u: number[], v: number[]) =>
    u.reduce((acc, x, k) => acc + x * v[k], 0);
  const perms: number[][] = [];
  const gen = (rest: number[], acc: number[]) => {
    if (rest.length === 0) perms.push(acc);
    rest.forEach((x, k) =>
      gen([...rest.slice(0, k), ...rest.slice(k + 1)], [...acc, x]),
    );
  };
  gen(_.range(1, n + 1), []);
  const mid = (n + 1) / 2;
  let project: (v: number[]) => [number, number];
  if (n === 3) {
    const a = [1 / Math.SQRT2, -1 / Math.SQRT2, 0];
    const b = [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6)];
    project = (v) => [dot(v, a), dot(v, b)];
  } else {
    // Schlegel diagram: eye just outside the face where π(4) = 4.
    const c = [-0.5, -0.5, -0.5, 1.5];
    const cLen = Math.sqrt(dot(c, c));
    const cHat = c.map((x) => x / cLen);
    const eye = c.map((x) => x * 1.6);
    const a = [1 / Math.SQRT2, -1 / Math.SQRT2, 0, 0];
    const b = [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6), 0];
    project = (v) => {
      const t =
        dot(eye, cHat) /
        dot(
          eye.map((e, k) => e - v[k]),
          cHat,
        );
      const w = eye.map((e, k) => e + t * (v[k] - e));
      return [dot(w, a), dot(w, b)];
    };
  }
  const raw = perms.map((perm) => ({
    key: permKey(perm),
    xy: Vec2(project(perm.map((x) => x - mid))),
  }));
  const R = Math.max(...raw.map(({ xy }) => xy.len()));
  const pos = new Map(raw.map(({ key, xy }) => [key, xy.div(R)]));
  const edges: [string, string][] = [];
  for (const perm of perms) {
    for (let i = 0; i < n - 1; i++) {
      const q = perm.slice();
      [q[i], q[i + 1]] = [q[i + 1], q[i]];
      if (permKey(perm) < permKey(q)) edges.push([permKey(perm), permKey(q)]);
    }
  }
  const layout = { pos, edges };
  permutohedronLayouts.set(n, layout);
  return layout;
}

// ## Rendering

const COLORS = [
  { fill: "#fecaca", stroke: "#dc2626" },
  { fill: "#fde68a", stroke: "#d97706" },
  { fill: "#bbf7d0", stroke: "#16a34a" },
  { fill: "#bfdbfe", stroke: "#2563eb" },
  { fill: "#ddd6fe", stroke: "#7c3aed" },
  { fill: "#fbcfe8", stroke: "#db2777" },
];
const colorOf = (v: number) => COLORS[(v - 1) % COLORS.length];

const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";
const sub = (k: number) => SUBSCRIPTS[k];

const TS = 34; // tile size
const WIDTH = 680;
const HEIGHT = 560;

function label(text: string, pos: Vec2) {
  return (
    <text
      transform={translate(pos)}
      fontSize={11}
      fill="#6b7280"
      fontFamily="system-ui, sans-serif"
      letterSpacing={0.5}
    >
      {text.toUpperCase()}
    </text>
  );
}

/** A section heading with a rule under it. */
function section(title: string, pos: Vec2, width: number) {
  return (
    <g transform={translate(pos)}>
      <text
        fontSize={11}
        fontWeight={600}
        fill="#374151"
        fontFamily="system-ui, sans-serif"
        letterSpacing={1}
      >
        {title.toUpperCase()}
      </text>
      <line x1={0} y1={7} x2={width} y2={7} stroke="#e5e7eb" strokeWidth={1} />
    </g>
  );
}

function tileContents(v: number, opts: { muted?: boolean } = {}) {
  const c = colorOf(v);
  return (
    <g>
      <rect
        width={TS}
        height={TS}
        rx={5}
        fill={opts.muted ? "#f3f4f6" : c.fill}
        stroke={opts.muted ? "#d1d5db" : c.stroke}
        strokeWidth={1.5}
      />
      <text
        transform={translate(TS / 2, TS / 2)}
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={17}
        fontWeight={500}
        fontFamily="system-ui, sans-serif"
        fill={opts.muted ? "#9ca3af" : "#1f2937"}
      >
        {v}
      </text>
    </g>
  );
}

const draggable: Draggable<State> = ({ state: rawState, d, draggedId }) => {
  const { n, mode } = rawState;
  // `cols` is the layout (may include zero-width closed columns left by
  // a cancel drop); `word` is the logical word all the math and drag
  // specs use, and `state` is the cleaned state they build on.
  const cols = rawState.word;
  const word: Letter[] = cols.filter((c): c is Letter => c !== "closed");
  const state: State = { ...rawState, word };
  const perm = permFromWord(n, word);
  const inv = inversions(perm);

  // Drag spec for a tile showing value `v` in a one-line-style row.
  // Shared by the one-line notation and the bottom row of the
  // two-line notation.
  // ### Wiring-diagram capacity
  // The wiring diagram has a fixed number of columns for a given n (room
  // for the longest reduced word plus a few), so the column width never
  // changes and transitions stay pure slides. Drags that would append
  // past the last column are refused.
  const COLS = Math.max(13, (n * (n - 1)) / 2 + 4);
  const CAP = COLS - 1; // letters, leaving one spare column
  const canAppend = (k: number) => word.length + k <= CAP;

  const tileDragSpec = (v: number) => {
    const i = perm.indexOf(v);
    if (mode === "adjacent") {
      // Only adjacent transpositions: each step multiplies by s_i and
      // writes a letter. Chaining lets one drag write a whole word.
      if (!canAppend(1)) return d.fixed(state);
      return d
        .closest([
          i > 0 &&
            d.between([state, { ...state, word: applyGenerator(word, i - 1) }]),
          i < n - 1 &&
            d.between([state, { ...state, word: applyGenerator(word, i) }]),
        ])
        .withSnapRadius(3, { chain: true });
    } else {
      // Free reordering of the one-line notation.
      const without = perm.filter((x) => x !== v);
      const states = _.range(n).map((j) => {
        const newPerm = [...without.slice(0, j), v, ...without.slice(j)];
        return { ...state, word: wordFromPerm(newPerm) };
      });
      return d.closest(states).whenFar(state).withFloating();
    }
  };

  const tileRow = (prefix: string, origin: Vec2) =>
    perm.map((v, i) => {
      const id = `${prefix}-${v}`;
      const isDragged = draggedId === id;
      return (
        <g
          id={id}
          transform={translate(origin.add(Vec2(i * TS, isDragged ? -6 : 0)))}
          dragologyZIndex={isDragged ? "/1" : false}
          dragologyOnDrag={() => tileDragSpec(v)}
          style={{ cursor: "grab" }}
        >
          {tileContents(v)}
        </g>
      );
    });

  // ### Word & inversion count
  const infoOrigin = Vec2(20, 310);
  const letterW = Math.min(22, 350 / Math.max(state.word.length, 1));
  // Letters of the word with their column index and a stable id: the
  // pair of wires that cross there (suffixed if a pair crosses twice).
  // `j` is the layout column, `jl` the index in the logical word.
  const wordLetters = (() => {
    const arr = _.range(1, n + 1);
    const seen = new Set<string>();
    const letters: { i: number; j: number; jl: number; pairId: string }[] = [];
    let jl = 0;
    cols.forEach((i, j) => {
      if (i === "closed") return;
      const myJl = jl++;
      if (i === null) return;
      const a = arr[i];
      const b = arr[i + 1];
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      let pairId = `${Math.min(a, b)}-${Math.max(a, b)}`;
      while (seen.has(pairId)) pairId += "x";
      seen.add(pairId);
      letters.push({ i, j, jl: myJl, pairId });
    });
    return letters;
  })();
  const L = wordLetters.length;

  // ### Two-line notation
  const twoLineOrigin = Vec2(38, 56);

  // ### Cycle diagram
  const NODE_R = 12;
  const cycleOrigin = Vec2(20, 216);
  const cycles = cyclesOf(perm);
  const cycleLayout = (() => {
    let x = 0;
    const nodePos = new Map<number, Vec2>();
    const rings: { center: Vec2; r: number; cyc: number[] }[] = [];
    for (const cyc of cycles) {
      const m = cyc.length;
      const r = m === 1 ? 0 : Math.max(22, 6 * m);
      const center = Vec2(x + r + NODE_R, 0);
      rings.push({ center, r, cyc });
      cyc.forEach((v, k) => {
        nodePos.set(v, center.add(Vec2.polarDeg(r, -90 + (360 * k) / m)));
      });
      x += 2 * (r + NODE_R) + 14;
    }
    return { nodePos, rings };
  })();

  const cycleDragSpec = (v: number) => {
    const without = cycles
      .map((c) => c.filter((x) => x !== v))
      .filter((c) => c.length > 0);
    const options = produceAmb({ cycles: without }, (draft) => {
      const ci = amb(_.range(draft.cycles.length + 1));
      if (ci === draft.cycles.length) {
        draft.cycles.push([v]); // become a fixed point
      } else {
        const c = draft.cycles[ci];
        const after = amb(_.range(c.length));
        c.splice(after + 1, 0, v); // v now follows c[after]
      }
    });
    const states = _.uniqBy(
      options.map((o) => permFromCycles(n, o.cycles)),
      (p) => p.join(","),
    ).map((p) => ({ ...state, word: wordFromPerm(p) }));
    return d.closest(states).withFloating();
  };

  // ### Permutation matrix
  const CS = 24;
  const matrixOrigin = Vec2(330, 72);

  const matrixDragSpec = (v: number) => {
    const row = perm.indexOf(v);
    const states = _.range(n).map((r) => {
      const p = perm.slice();
      [p[row], p[r]] = [p[r], p[row]];
      return { ...state, word: wordFromPerm(p) };
    });
    return d.closest(states).withFloating();
  };

  // ### Permutohedron
  const PH_R = 88;
  const phOrigin = Vec2(WIDTH - PH_R - 12, 160);
  const ph: PermutohedronLayout =
    n <= 4 ? permutohedronLayout(n) : { pos: new Map(), edges: [] };
  // the walk from the identity along the word (a path on the map)
  const phWalk =
    n <= 4
      ? _.range(word.length + 1).map(
          (k) => ph.pos.get(permKey(permFromWord(n, word.slice(0, k))))!,
        )
      : [];

  // ### Wiring diagram
  const RS = 24; // row spacing
  const wiringOrigin = Vec2(48, 420);
  const rawLen = cols.length; // layout columns (incl. blank and closed)
  // The diagram always spans COLS column widths (padded with straight
  // columns), and every column is one cubic segment. So a wire's path keeps the same structure when a crossing
  // is appended, and path interpolation only bends the new column —
  // existing crossings stay put mid-drag. Closed columns have zero
  // width; the last padding column stretches to the right edge.
  const CW = (WIDTH - 110) / COLS; // column width
  const wireX0 = 0;
  const wireX1 = wireX0 + COLS * CW;
  const rowY = (r: number) => r * RS;
  const colW = (j: number) => (j < rawLen && cols[j] === "closed" ? 0 : CW);
  const colX = (j: number) =>
    wireX0 +
    _.sum(_.range(Math.min(j, rawLen)).map(colW)) +
    Math.max(0, j - rawLen) * CW;
  const padCols = Math.max(1, COLS - rawLen); // straight columns after the word

  const wirePath = (v: number) => {
    let r = v - 1;
    let x = wireX0;
    let dstr = `M ${x - 14} ${rowY(r)} L ${x} ${rowY(r)}`;
    for (let j = 0; j < rawLen + padCols; j++) {
      const c: Col = j < rawLen ? cols[j] : null;
      const w = j === rawLen + padCols - 1 ? wireX1 - x : colW(j);
      const next =
        typeof c !== "number" ? r : r === c ? c + 1 : r === c + 1 ? c : r;
      dstr += ` C ${x + w / 2} ${rowY(r)} ${x + w / 2} ${rowY(next)} ${x + w} ${rowY(next)}`;
      r = next;
      x += w;
    }
    dstr += ` L ${wireX1 + 14} ${rowY(r)}`;
    return dstr;
  };

  return (
    <g>
      <style>{`
        .plab-hit:hover { opacity: 0.35 !important; }
      `}</style>
      {/* ## Section headings */}
      {section("the permutation π", Vec2(20, 16), 440)}
      {section("permutohedron", Vec2(WIDTH - 2 * PH_R - 20, 16), 2 * PH_R + 20)}
      {section("a word for π", Vec2(20, 290), WIDTH - 40)}
      {/* ## Word & inversions */}{" "}
      <g transform={translate(infoOrigin.add(Vec2(0, 22)))}>
        <text
          id="word-pi"
          fontSize={18}
          fontFamily="Georgia, serif"
          fontStyle="italic"
          fill="#1f2937"
        >
          π =
        </text>
        {L === 0 && (
          <text
            transform={translate(34, 0)}
            fontSize={18}
            fontFamily="Georgia, serif"
            fill="#9ca3af"
          >
            e
          </text>
        )}
        {wordLetters.map(({ i, jl, pairId }, k) => (
          <text
            id={`word-letter-${pairId}`}
            dragologyEmergeFrom={
              k === 0 ? "word-pi" : `word-letter-${wordLetters[k - 1].pairId}`
            }
            dragologyEmergeMode="scale"
            transform={translate(34 + jl * letterW, 0)}
            fontSize={18}
            fontFamily="Georgia, serif"
            fontStyle="italic"
            fill="#1f2937"
          >
            s{sub(i + 1)}
          </text>
        ))}
      </g>
      <g transform={translate(infoOrigin.add(Vec2(0, 52)))}>
        <text fontSize={13} fontFamily="system-ui, sans-serif" fill="#374151">
          length {L} · inversions {inv} ·{" "}
          {L === inv ? "reduced ✓" : `not reduced (${L - inv} to cancel)`}
        </text>
      </g>
      {/* ## Two-line notation */}
      {label("two-line notation", twoLineOrigin.add(Vec2(-18, -12)))}
      {/* (the bottom row is the one-line notation) */}
      <g transform={translate(twoLineOrigin)}>
        <path
          d={`M -6 -4 Q -18 ${TS + 4} -6 ${2 * TS + 12}`}
          fill="none"
          stroke="#9ca3af"
          strokeWidth={1.5}
        />
        <path
          d={`M ${n * TS + 6} -4 Q ${n * TS + 18} ${TS + 4} ${n * TS + 6} ${2 * TS + 12}`}
          fill="none"
          stroke="#9ca3af"
          strokeWidth={1.5}
        />
        {_.range(1, n + 1).map((k) => (
          <g transform={translate((k - 1) * TS, 0)}>
            {tileContents(k, { muted: true })}
          </g>
        ))}
      </g>
      {tileRow("tl-tile", twoLineOrigin.add(Vec2(0, TS + 8)))}
      {/* ## Cycle diagram */}
      {label("cycle diagram", cycleOrigin.add(Vec2(0, -54)))}
      <g transform={translate(cycleOrigin)}>
        {cycleLayout.rings.map(({ center, r, cyc }) => (
          // Same structure whatever the cycle length, so the interpolator
          // can match ring groups across states: one (possibly hidden)
          // ring circle, plus id'd layers for the loop or the arrows.
          <g id={`cyc-ring-${cyc[0]}`} dragologyZIndex={-1}>
            <circle
              transform={translate(center)}
              r={r}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth={1}
              opacity={cyc.length === 1 ? 0 : 1}
            />
            {cyc.length === 1 ? (
              // fixed point: a little self-loop above the node
              <g id={`cyc-loop-${cyc[0]}`} transform={translate(center)}>
                <path
                  d={`M -5 ${-NODE_R + 3} A 8 8 0 1 1 5 ${-NODE_R + 3}`}
                  fill="none"
                  stroke="#9ca3af"
                  strokeWidth={1.5}
                />
                {arrowhead({
                  tip: Vec2(5, -NODE_R + 3),
                  direction: Vec2(-0.6, 1),
                  headLength: 6,
                  headAngleRad: Math.PI / 3,
                  fill: "#9ca3af",
                })}
              </g>
            ) : (
              cyc.map((a, k) => {
                const b = cyc[(k + 1) % cyc.length];
                const m = cyc.length;
                const delta = Math.asin(Math.min(1, (NODE_R + 4) / r));
                const th0 = ((-90 + (360 * k) / m) * Math.PI) / 180 + delta;
                const th1 =
                  ((-90 + (360 * (k + 1)) / m) * Math.PI) / 180 - delta;
                const p0 = center.add(Vec2.polarRad(r, th0));
                const p1 = center.add(Vec2.polarRad(r, th1));
                const tangent = Vec2.polarRad(1, th1 + Math.PI / 2);
                return (
                  <g id={`cyc-arrow-${a}-${b}`}>
                    <path
                      d={`M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`}
                      fill="none"
                      stroke="#6b7280"
                      strokeWidth={1.5}
                    />
                    {arrowhead({
                      tip: p1,
                      direction: tangent,
                      headLength: 7,
                      headAngleRad: Math.PI / 3,
                      fill: "#6b7280",
                    })}
                  </g>
                );
              })
            )}
          </g>
        ))}
        {_.range(1, n + 1).map((v) => {
          const id = `cyc-node-${v}`;
          const isDragged = draggedId === id;
          const c = colorOf(v);
          return (
            <g
              id={id}
              transform={translate(cycleLayout.nodePos.get(v)!)}
              dragologyZIndex={isDragged ? "/1" : false}
              dragologyOnDrag={() => cycleDragSpec(v)}
              style={{ cursor: "grab" }}
            >
              <circle
                r={NODE_R}
                fill={c.fill}
                stroke={c.stroke}
                strokeWidth={1.5}
              />
              <text
                dominantBaseline="central"
                textAnchor="middle"
                fontSize={13}
                fontWeight={500}
                fontFamily="system-ui, sans-serif"
                fill="#1f2937"
              >
                {v}
              </text>
            </g>
          );
        })}
      </g>
      {/* ## Permutation matrix */}
      {label("permutation matrix", matrixOrigin.add(Vec2(0, -28)))}
      <g transform={translate(matrixOrigin)}>
        <rect
          width={n * CS}
          height={n * CS}
          fill="white"
          stroke="#9ca3af"
          strokeWidth={1}
        />
        {_.range(1, n).map((k) => (
          <g>
            <line x1={k * CS} y1={0} x2={k * CS} y2={n * CS} stroke="#e5e7eb" />
            <line x1={0} y1={k * CS} x2={n * CS} y2={k * CS} stroke="#e5e7eb" />
          </g>
        ))}
        {_.range(1, n + 1).map((k) => (
          <g>
            <text
              transform={translate((k - 0.5) * CS, -7)}
              textAnchor="middle"
              fontSize={9}
              fill="#9ca3af"
              fontFamily="system-ui, sans-serif"
            >
              {k}
            </text>
            <text
              transform={translate(-7, (k - 0.5) * CS)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={9}
              fill="#9ca3af"
              fontFamily="system-ui, sans-serif"
            >
              {k}
            </text>
          </g>
        ))}
        {_.range(1, n + 1).map((v) => {
          const id = `mat-dot-${v}`;
          const isDragged = draggedId === id;
          const row = perm.indexOf(v);
          const c = colorOf(v);
          return (
            <g
              id={id}
              transform={translate((v - 0.5) * CS, (row + 0.5) * CS)}
              dragologyZIndex={isDragged ? "/1" : false}
              dragologyOnDrag={() => matrixDragSpec(v)}
              style={{ cursor: "grab" }}
            >
              <circle r={CS / 2 - 2} fill="transparent" />
              <circle r={7} fill={c.stroke} />
            </g>
          );
        })}
      </g>
      {label("row i, column π(i)", matrixOrigin.add(Vec2(0, n * CS + 14)))}
      {/* ## Permutohedron */}
      {label("vertex = π, walk = word", Vec2(WIDTH - 2 * PH_R - 20, 44))}
      {n <= 4 ? (
        <g transform={translate(phOrigin)}>
          {ph.edges.map(([a, b]) => (
            <line
              {...ph.pos.get(a)!.mul(PH_R).xy1()}
              {...ph.pos.get(b)!.mul(PH_R).xy2()}
              stroke="#d1d5db"
              strokeWidth={1}
            />
          ))}
          {/* The walk, one id'd segment per step so earlier steps never
              change shape, plus a zero-length tip segment at the last
              vertex: when a step is appended, the tip stretches along
              the new edge with the token. */}
          {[...phWalk, phWalk[phWalk.length - 1]].map((p, k) =>
            k === 0 ? null : (
              <line
                id={`ph-walk-${k - 1}`}
                {...phWalk[k - 1].mul(PH_R).xy1()}
                {...p.mul(PH_R).xy2()}
                stroke="#2563eb"
                strokeWidth={3}
                strokeLinecap="round"
                opacity={0.3}
              />
            ),
          )}
          {[...ph.pos.entries()].map(([key, p]) => (
            <g transform={translate(p.mul(PH_R))}>
              <circle r={2.5} fill="#9ca3af" />
              {n === 3 && (
                <text
                  transform={translate(p.mul(14))}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={9}
                  fill="#9ca3af"
                  fontFamily="system-ui, sans-serif"
                >
                  {key}
                </text>
              )}
            </g>
          ))}
          <g
            id="ph-token"
            transform={translate(ph.pos.get(permKey(perm))!.mul(PH_R))}
            dragologyZIndex={1}
            dragologyOnDrag={() =>
              !canAppend(1)
                ? d.fixed(state)
                : d
                    .closest(
                      _.range(n - 1).map((i) =>
                        d.between([
                          state,
                          { ...state, word: applyGenerator(word, i) },
                        ]),
                      ),
                    )
                    // targets are close together, so snap late
                    .withSnapRadius(3, { chain: true })
            }
            style={{ cursor: canAppend(1) ? "grab" : "not-allowed" }}
          >
            <circle r={8} fill="#2563eb" stroke="white" strokeWidth={2} />
          </g>
        </g>
      ) : (
        <text
          transform={translate(phOrigin.add(Vec2(-PH_R, 0)))}
          fontSize={11}
          fill="#9ca3af"
          fontFamily="system-ui, sans-serif"
        >
          (drawn for n ≤ 4 only)
        </text>
      )}
      {/* ## Wiring diagram */}
      {label(
        !canAppend(1)
          ? "wiring diagram is full — cancel a double crossing, or reset"
          : "wiring diagram (drag crossings past each other, or a strand over its neighbor)",
        wiringOrigin.add(Vec2(-28, -22)),
      )}
      <g transform={translate(wiringOrigin)}>
        {_.range(1, n + 1).map((v) => (
          <g>
            <text
              transform={translate(wireX0 - 22, rowY(v - 1))}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fill="#6b7280"
              fontFamily="system-ui, sans-serif"
            >
              {v}
            </text>
            {/* the strand's end label: drag it past a neighbor to add a
                crossing (appends s_row, chained) */}
            <g
              id={`wire-end-${v}`}
              transform={translate(wireX1 + 22, rowY(perm.indexOf(v)))}
              dragologyZIndex={1}
              dragologyOnDrag={() => {
                const row = perm.indexOf(v);
                if (!canAppend(1)) return d.fixed(state);
                return (
                  d
                    .closest([
                      row > 0 &&
                        d.between([
                          state,
                          { ...state, word: applyGenerator(word, row - 1) },
                        ]),
                      row < n - 1 &&
                        d.between([
                          state,
                          { ...state, word: applyGenerator(word, row) },
                        ]),
                    ])
                    // rows are only RS apart, so snap late
                    .withSnapRadius(3, { chain: true })
                );
              }}
              style={{ cursor: canAppend(1) ? "ns-resize" : "not-allowed" }}
            >
              <circle
                r={RS / 2 - 1}
                fill={colorOf(v).fill}
                opacity={draggedId === `wire-end-${v}` ? 0.6 : 0}
                className="plab-hit"
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontWeight={600}
                fill={colorOf(v).stroke}
                fontFamily="system-ui, sans-serif"
              >
                {v}
              </text>
            </g>
          </g>
        ))}
        {_.range(1, n + 1).map((v) => (
          <path
            id={`wire-${v}`}
            d={wirePath(v)}
            fill="none"
            stroke={colorOf(v).stroke}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        ))}
        {wordLetters.map(({ i, j, jl, pairId }) => {
          const id = `cross-${pairId}`;
          const moves = crossingMoves(word, jl);
          const center = Vec2(colX(j) + CW / 2, (i + 0.5) * RS);
          return (
            <g
              id={id}
              transform={translate(center)}
              dragologyZIndex={1}
              dragologyOnDrag={() =>
                moves.length === 0
                  ? d.fixed(state)
                  : d
                      .closest(
                        moves.map((w) =>
                          d.between([state, { ...state, word: w }]),
                        ),
                      )
                      .withSnapRadius(3, { chain: true })
              }
              style={{ cursor: moves.length === 0 ? "not-allowed" : "grab" }}
            >
              <circle
                r={Math.min(CW, RS) / 2 - 1}
                fill={moves.length === 0 ? "#9ca3af" : "#2563eb"}
                opacity={draggedId === id ? 0.35 : 0}
                className="plab-hit"
              />
            </g>
          );
        })}
        {/* Strand handles: drag a straight bit of strand across its
            neighbor to write s_i s_i; drag the apex of such a double
            crossing back across to cancel it (s_i s_i = e). */}
        {_.range(1, n + 1).map((v) => {
          const handles: Svgx[] = [];
          let rMut = v - 1;
          let jMut = 0;
          while (jMut <= rawLen) {
            // snapshot the loop variables so drag closures don't see
            // later mutations
            const j = jMut;
            const r = rMut;
            // index of this column in the logical word; handle ids use it
            // so they line up across states with and without closed columns
            const jl = cols.slice(0, j).filter((c) => c !== "closed").length;
            const id = `strand-${v}-${jl}`;
            if (j < rawLen && cols[j] === "closed") {
              jMut += 1; // zero width, nothing to grab
              continue;
            }
            const letter: Letter = j < rawLen ? (cols[j] as Letter) : null;
            const next =
              letter === null
                ? r
                : r === letter
                  ? letter + 1
                  : r === letter + 1
                    ? letter
                    : r;
            // Pair up runs of identical letters from the right, so that a
            // pair inserted next to an existing identical crossing is the
            // pair (the apex id must match the one the drag started from).
            let runLen = 0;
            while (word[jl + runLen] === letter) runLen++;
            if (
              letter !== null &&
              next !== r &&
              word[jl + 1] === letter &&
              runLen % 2 === 0
            ) {
              // apex of a double crossing at columns j, j+1
              const gapped: State = {
                ...state,
                word: word.map((l, k) => (k === jl || k === jl + 1 ? null : l)),
              };
              handles.push(
                <g
                  id={id}
                  transform={translate(colX(j + 1), rowY(next))}
                  dragologyZIndex={1}
                  dragologyOnDrag={() =>
                    d.between([state, gapped]).onDrop((s) => ({
                      ...s,
                      // blanks become zero-width closed columns, so the
                      // drop animation is a horizontal slide
                      word: s.word.map((l) => (l === null ? "closed" : l)),
                    }))
                  }
                  style={{ cursor: "ns-resize" }}
                >
                  <rect
                    transform={translate(-RS * 0.35, -RS * 0.35)}
                    width={RS * 0.7}
                    height={RS * 0.7}
                    rx={4}
                    fill="#dc2626"
                    opacity={draggedId === id ? 0.35 : 0}
                    className="plab-hit"
                  />
                </g>,
              );
              jMut += 2;
              continue;
            }
            if (letter === null && j + 1 < rawLen && cols[j + 1] === null) {
              // two blank columns (mid-cancel): the apex handle lands here
              handles.push(
                <g id={id} transform={translate(colX(j + 1), rowY(r))} />,
              );
              jMut += 2;
              continue;
            }
            if (next === r && canAppend(2)) {
              // straight segment. The drag starts from a state with two
              // zero-width columns here (drawn identically to the current
              // state), so the double crossing widens from nothing and
              // everything to the right slides over, instead of columns
              // morphing in place.
              const withClosed: State = {
                ...state,
                word: [
                  ...word.slice(0, jl),
                  "closed",
                  "closed",
                  ...word.slice(jl),
                ],
              };
              const insert = (i: number): State => ({
                ...state,
                word: [...word.slice(0, jl), i, i, ...word.slice(jl)],
              });
              // The handle sits at the column's right edge, which is where
              // the apex of the new double crossing ends up, so the drag
              // is purely vertical; the hit rect covers the column.
              handles.push(
                <g
                  id={id}
                  transform={translate(colX(j + 1), rowY(r))}
                  dragologyZIndex={1}
                  dragologyOnDrag={() =>
                    d.closest([
                      r > 0 && d.between([withClosed, insert(r - 1)]),
                      r < n - 1 && d.between([withClosed, insert(r)]),
                    ])
                  }
                  style={{ cursor: "ns-resize" }}
                >
                  <rect
                    transform={translate(-CW * 0.9, -RS * 0.3)}
                    width={CW * 0.8}
                    height={RS * 0.6}
                    rx={4}
                    fill="#dc2626"
                    opacity={draggedId === id ? 0.35 : 0}
                    className="plab-hit"
                  />
                </g>,
              );
            }
            rMut = next;
            jMut += 1;
          }
          return <g>{handles}</g>;
        })}
      </g>
    </g>
  );
};

const INITIAL_PERMS: Record<number, number[]> = {
  3: [2, 3, 1],
  4: [3, 1, 4, 2],
  5: [3, 5, 1, 4, 2],
  6: [3, 5, 1, 6, 4, 2],
};

export default demo(
  () => {
    const [n, setN] = useState(4);
    const [mode, setMode] = useState<Mode>("free");
    const [resetCount, setResetCount] = useState(0);
    return (
      <div>
        <DemoNotes>
          One permutation, several notations, all in sync. Drag tiles in the
          bottom row of the two-line notation to reorder; switch to{" "}
          <i>adjacent only</i> and each step literally appends a generator to
          the word (the inversion count ticks; the word is reduced exactly when
          its length equals the inversion count). Drag a node in the cycle
          diagram into any cycle at any position. Drag a dot in the matrix
          within its column. Drag a crossing in the wiring diagram past its
          neighbor: commutations slide it one column, braid moves jump it across
          the third strand (or drag the middle crossing of a braid vertically) —
          the word changes, π doesn't. Drag a straight bit of strand over its
          neighbor to write s<sub>i</sub>s<sub>i</sub>; drag the apex of such a
          double crossing back to cancel it. The permutohedron (n ≤ 4) maps
          every permutation to a vertex, with edges for adjacent transpositions;
          drag the token along edges to walk (and write) a word.
        </DemoNotes>
        <div className="flex flex-wrap items-start gap-6 bg-gray-50 rounded p-3 mb-3 text-xs">
          <ConfigSelect
            label="n"
            value={n}
            onChange={setN}
            options={[3, 4, 5, 6]}
          />
          <ConfigRadio
            label="Tile drags"
            value={mode}
            onChange={setMode}
            options={{
              free: "free reorder",
              adjacent: "adjacent transpositions only (chained)",
            }}
          />
          <button
            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white hover:bg-gray-100"
            onClick={() => setResetCount((c) => c + 1)}
          >
            reset
          </button>
        </div>
        <DemoDraggable
          key={`${n}-${resetCount}`}
          draggable={draggable}
          initialState={{
            n,
            // start somewhere interesting; reset goes to the identity
            word: resetCount === 0 ? wordFromPerm(INITIAL_PERMS[n]) : [],
            mode,
          }}
          stateOverride={{ mode }}
          width={WIDTH}
          height={HEIGHT}
        />
      </div>
    );
  },
  {
    tags: [
      "d.between",
      "d.closest",
      "spec.whenFar",
      "spec.withFloating",
      "spec.withSnapRadius [chain]",
      "produceAmb",
      "reordering",
      "math",
    ],
  },
);
