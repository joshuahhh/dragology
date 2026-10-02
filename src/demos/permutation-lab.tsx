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

/** A letter s_i, or a blank column. Blank columns only exist mid-drag:
 * cancelling s_i s_i first empties the two columns (so nothing to the
 * right shifts while you drag), then the drop compacts them. A blank
 * remembers the letter it stands in for, so the two wires that crossed
 * there keep a (flat) segment in their paths; see `wirePath`. */
type Letter = number | { blank: number };

/** What the state's word actually stores: letters, blank columns, and
 * "closed" columns. A closed column is a blank that has been cancelled:
 * it draws with zero width, so the drop animation after a cancel is a
 * plain horizontal slide of everything to its right (the wire paths keep
 * the same structure). Closed columns are dropped from the logical word
 * as soon as the next interaction builds a new state. They also stand in
 * for a letter, for the same reason blanks do. */
type Col = Letter | { closed: number };

const isZeroWidth = (c: Col): c is { closed: number } =>
  typeof c === "object" && "closed" in c;

/** The generator a column is or stands in for. */
const colGenerator = (c: Col): number =>
  typeof c === "number" ? c : "blank" in c ? c.blank : c.closed;

type State = {
  n: number;
  word: Col[];
  mode: Mode;
  /** Layout hint for the wiring diagram: draw wires with one segment
   * per column instead of one per crossing (see `wirePath`). Set on
   * both ends of a braid drag; dropped, like closed columns, as soon as
   * the next interaction builds a new state. */
  wiresByColumn?: true;
};

// ## Permutation math

function permFromWord(n: number, word: Letter[]): number[] {
  const arr = _.range(1, n + 1);
  for (const i of word) {
    if (typeof i !== "number") continue;
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

/** Is `word[start..start+2]` a braid s_i s_k s_i with |i−k| = 1? */
function isBraidAt(word: Letter[], start: number): boolean {
  const a = start >= 0 ? word[start] : null;
  const b = word[start + 1];
  return (
    typeof a === "number" &&
    typeof b === "number" &&
    word[start + 2] === a &&
    Math.abs(a - b) === 1
  );
}

/** Apply the braid move s_i s_k s_i = s_k s_i s_k at `word[start..]`. */
function braidAt(word: Letter[], start: number): Letter[] {
  const w = word.slice();
  [w[start], w[start + 1], w[start + 2]] = [
    word[start + 1],
    word[start],
    word[start + 1],
  ];
  return w;
}

/** Words reachable from `word` by one Coxeter relation that moves the
 * crossing at column `j`: a commutation s_i s_k = s_k s_i (|i−k| ≥ 2)
 * with a neighbor, or a braid move s_i s_k s_i = s_k s_i s_k (|i−k| = 1).
 * A braid move is only offered from the middle crossing, which moves one
 * row vertically. The end crossings also change places in a braid move,
 * but each would jump two columns and a row, which doesn't read as
 * dragging that crossing anywhere. (The strand that bumps around the
 * middle crossing can also be dragged across it; see the strand
 * handles.) */
function crossingMoves(
  word: Letter[],
  j: number,
): { word: Letter[]; braid: boolean }[] {
  const i = word[j];
  if (typeof i !== "number") return [];
  const at = (k: number): Letter | null =>
    k >= 0 && k < word.length ? word[k] : null;
  const commutes = (k: number) => {
    const l = at(k);
    return typeof l === "number" && Math.abs(l - i) >= 2;
  };
  const swapped = (a: number, b: number) => {
    const w = word.slice();
    [w[a], w[b]] = [w[b], w[a]];
    return w;
  };
  const moves: { word: Letter[]; braid: boolean }[] = [];
  if (commutes(j - 1)) moves.push({ word: swapped(j - 1, j), braid: false });
  if (commutes(j + 1)) moves.push({ word: swapped(j, j + 1), braid: false });
  if (isBraidAt(word, j - 1))
    moves.push({ word: braidAt(word, j - 1), braid: true });
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
  const word: Letter[] = cols.filter((c): c is Letter => !isZeroWidth(c));
  const state: State = { n, word, mode };
  const byColumn = (s: State): State => ({ ...s, wiresByColumn: true });
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
      if (isZeroWidth(i)) return;
      const myJl = jl++;
      if (typeof i !== "number") return;
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
    return d.between(states);
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
  // The diagram always spans COLS column widths. Closed columns have zero
  // width.
  const CW = (WIDTH - 110) / COLS; // column width
  const wireX0 = 0;
  const wireX1 = wireX0 + COLS * CW;
  const rowY = (r: number) => r * RS;
  const colW = (j: number) => (j < rawLen && isZeroWidth(cols[j]) ? 0 : CW);
  const colX = (j: number) =>
    wireX0 +
    _.sum(_.range(Math.min(j, rawLen)).map(colW)) +
    Math.max(0, j - rawLen) * CW;

  // A wire's path is a fixed number of segments, each a straight run up
  // to a column and then a cubic across it, so path interpolation
  // matches segment k with segment k. Which columns get segments decides
  // what a drag looks like halfway:
  //
  // - By crossing (the default): one segment per crossing the wire takes
  //   part in, in order. When a crossing commutes past its neighbor, its
  //   segment slides sideways at full height, rather than two columns
  //   each bending halfway. Blank and closed columns get flat segments,
  //   so cancelling or inserting s_i s_i keeps the same structure.
  //   Unused segments are flat and park at the first free column (full
  //   width there, so an appended crossing bends it in place) and just
  //   after it.
  // - By column (`wiresByColumn`): one segment per column. In a braid
  //   move the crossings stay in their columns and change rows, so
  //   every column bends at once; halfway, the two outer strands cross
  //   diagonally with the third passing straight through the triple
  //   point.
  const WIRE_SEGS = COLS + 2;
  const seg = (x: number, w: number, r0: number, r1: number) =>
    `L ${x} ${rowY(r0)} C ${x + w / 2} ${rowY(r0)} ${x + w / 2} ${rowY(r1)} ${x + w} ${rowY(r1)}`;
  const rowAfterCol = (r: number, c: Col) => {
    const i = colGenerator(c);
    return typeof c !== "number" || (r !== i && r !== i + 1)
      ? r
      : r === i
        ? i + 1
        : i;
  };
  const wirePath = (v: number) => {
    const segs: string[] = [];
    let r = v - 1;
    if (rawState.wiresByColumn) {
      cols.forEach((c, j) => {
        const next = rowAfterCol(r, c);
        segs.push(seg(colX(j), colW(j), r, next));
        r = next;
      });
      const xFree = colX(rawLen);
      segs.push(seg(xFree, wireX1 - xFree, r, r));
      return `M ${wireX0 - 14} ${rowY(v - 1)} ${segs.join(" ")} L ${wireX1 + 14} ${rowY(r)}`;
    }
    cols.forEach((c, j) => {
      const i = colGenerator(c);
      if (r !== i && r !== i + 1) return;
      const next = rowAfterCol(r, c);
      segs.push(seg(colX(j), colW(j), r, next));
      r = next;
    });
    const xFree = colX(rawLen);
    const wFree = _.clamp(wireX1 - xFree, 0, CW);
    segs.push(seg(xFree, wFree, r, r));
    while (segs.length < WIRE_SEGS) segs.push(seg(xFree + wFree, 0, r, r));
    return `M ${wireX0 - 14} ${rowY(v - 1)} ${segs.join(" ")} L ${wireX1 + 14} ${rowY(r)}`;
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
        {/* fixed anchors for letters to grow from: they never scale,
            so a letter emerging while its neighbor is still emerging
            (chained drags) doesn't stack scale transforms */}
        {_.range(CAP).map((k) => (
          <g id={`word-slot-${k}`} transform={translate(34 + k * letterW, 0)} />
        ))}
        {wordLetters.map(({ i, jl, pairId }) => (
          <text
            id={`word-letter-${pairId}`}
            dragologyEmergeFrom={`word-slot-${jl}`}
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
              style={{ cursor: "ns-resize" }}
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
                      // commit to an edge once out on it; the shortest
                      // edges are only ~20px, so lock early
                      { lockPast: 10 },
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
                        moves.map(({ word: w, braid }) => {
                          const moved = { ...state, word: w };
                          return braid
                            ? d.between([byColumn(state), byColumn(moved)])
                            : d.between([state, moved]);
                        }),
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
            crossing back across to cancel it (s_i s_i = e); drag the
            strand that bumps around the middle of a braid s_i s_k s_i
            across that crossing to get s_k s_i s_k. */}
        {_.range(1, n + 1).map((v) => {
          // Walk the logical word (zero-width closed columns are skipped;
          // `layoutOf` maps a logical index to its layout column). Handle
          // ids use logical indices so they line up across states with
          // and without closed columns, and every handle sits at the right
          // edge of its column.
          const handles: Svgx[] = [];
          const L = word.length;
          const realCols = _.range(rawLen).filter((j) => !isZeroWidth(cols[j]));
          const layoutOf = (k: number) => (k < L ? realCols[k] : rawLen);
          const edgeX = (k: number) => colX(layoutOf(k)) + CW;
          const rowAfter = (r: number, letter: Letter | null) =>
            typeof letter !== "number"
              ? r
              : r === letter
                ? letter + 1
                : r === letter + 1
                  ? letter
                  : r;
          let rMut = v - 1;
          let kMut = 0;
          while (kMut <= L) {
            // snapshot the loop variables so drag closures don't see
            // later mutations
            const k = kMut;
            const r = rMut;
            const id = `strand-${v}-${k}`;
            const letter: Letter | null = k < L ? word[k] : null;
            const next = rowAfter(r, letter);
            // Pair up runs of identical letters from the right, so that a
            // pair inserted next to an existing identical crossing is the
            // pair (the apex id must match the one the drag started from).
            let runLen = 0;
            while (k + runLen < L && word[k + runLen] === letter) runLen++;
            if (
              typeof letter === "number" &&
              next !== r &&
              word[k + 1] === letter &&
              runLen % 2 === 0
            ) {
              // apex of a double crossing at logical columns k, k+1
              const gapped: State = {
                ...state,
                word: word.map((l, m) =>
                  m === k || m === k + 1 ? { blank: colGenerator(l) } : l,
                ),
              };
              handles.push(
                <g
                  id={id}
                  transform={translate(edgeX(k), rowY(next))}
                  dragologyZIndex={1}
                  dragologyOnDrag={() =>
                    d.between([state, gapped]).onDrop((s) => ({
                      ...s,
                      // blanks become zero-width closed columns, so the
                      // drop animation is a horizontal slide
                      word: s.word.map((l) =>
                        typeof l === "object" && "blank" in l
                          ? { closed: l.blank }
                          : l,
                      ),
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
              rMut = rowAfter(next, letter);
              kMut += 2;
              continue;
            }
            if (
              typeof letter === "object" &&
              letter !== null &&
              typeof word[k + 1] === "object"
            ) {
              // two blank columns (mid-cancel): the apex handle lands here
              handles.push(
                <g id={id} transform={translate(edgeX(k), rowY(r))} />,
              );
              kMut += 2;
              continue;
            }
            // In a braid s_a s_b s_a at logical columns k-1..k+1, one
            // strand crosses both a's and passes straight by the middle
            // crossing (in the row of crossing a that b doesn't touch).
            // Dragging it across b is the braid move; it lands at the
            // same column, two rows over, so the handle id carries over.
            const braidSide =
              typeof letter === "number" &&
              isBraidAt(word, k - 1) &&
              (r === word[k - 1] || r === colGenerator(word[k - 1]) + 1) &&
              r !== letter &&
              r !== letter + 1
                ? r < letter
                  ? "below"
                  : "above"
                : null;
            if (next === r && (canAppend(2) || braidSide)) {
              // straight segment. The drag starts from a state with two
              // zero-width columns here (drawn identically to the current
              // state), so the double crossing widens from nothing and
              // everything to the right slides over, instead of columns
              // morphing in place. The handle sits at the column's right
              // edge, which is where the new apex ends up, so the drag is
              // purely vertical; the hit rect covers the column.
              const withClosed = (i: number): State => ({
                ...state,
                word: [
                  ...word.slice(0, k),
                  { closed: i },
                  { closed: i },
                  ...word.slice(k),
                ],
              });
              const insert = (i: number): State => ({
                ...state,
                word: [...word.slice(0, k), i, i, ...word.slice(k)],
              });
              handles.push(
                <g
                  id={id}
                  transform={translate(edgeX(k), rowY(r))}
                  dragologyZIndex={1}
                  dragologyOnDrag={() => {
                    const braided = d.between([
                      byColumn(state),
                      byColumn({ ...state, word: braidAt(word, k - 1) }),
                    ]);
                    return d.closest([
                      braidSide === "above"
                        ? braided
                        : r > 0 &&
                          canAppend(2) &&
                          d.between([withClosed(r - 1), insert(r - 1)]),
                      braidSide === "below"
                        ? braided
                        : r < n - 1 &&
                          canAppend(2) &&
                          d.between([withClosed(r), insert(r)]),
                    ]);
                  }}
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
            kMut += 1;
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
          neighbor to commute them. In a braid s<sub>i</sub>s<sub>j</sub>s
          <sub>i</sub>, drag the middle crossing vertically, or drag the strand
          that bends around it across it, to get s<sub>j</sub>s<sub>i</sub>s
          <sub>j</sub>. Either way the word changes, π doesn't. Drag a straight
          bit of strand over its neighbor to write s<sub>i</sub>s<sub>i</sub>;
          drag the apex of such a double crossing back to cancel it. The
          permutohedron (n ≤ 4) maps every permutation to a vertex, with edges
          for adjacent transpositions; drag the token along edges to walk (and
          write) a word.
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
