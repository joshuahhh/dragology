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
import { moreThan, param } from "../DragSpec";
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

export type Mode = "free" | "adjacent";
export type PhStyle = "solid" | "schlegel";

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

export type State = {
  n: number;
  word: Col[];
  mode: Mode;
  /** How to draw the n = 4 permutohedron, and (as a solid) which way
   * it's turned. */
  phStyle: PhStyle;
  view: View;
  /** Layout hint for the wiring diagram: draw wires with one segment
   * per column instead of one per crossing (see `wirePath`). Set on
   * both ends of a braid drag; dropped, like closed columns, as soon as
   * the next interaction builds a new state. */
  wiresByColumn?: true;
};

// ## Permutation math

function permFromWord(n: number, word: Col[]): number[] {
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
export function wordFromPerm(perm: number[]): number[] {
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

/** Where the word has a double letter s_i s_i (or two blanks for the
 * same generator) that the handles treat as a pair: runs of one letter
 * pair up from the right, so that a pair inserted next to an existing
 * identical letter is the pair. Returns the index of each pair's first
 * letter. */
function doublePairs(word: Letter[]): Set<number> {
  const same = (a: Letter | undefined, b: Letter) =>
    a !== undefined &&
    typeof a === typeof b &&
    colGenerator(a) === colGenerator(b);
  const pairs = new Set<number>();
  let k = 0;
  while (k < word.length) {
    let run = 0;
    while (same(word[k + run], word[k])) run++;
    if (run >= 2 && run % 2 === 0) {
      pairs.add(k);
      k += 2;
    } else {
      k += 1;
    }
  }
  return pairs;
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
// edges join permutations differing by an adjacent transposition. A
// permutation π sits at π⁻¹, i.e. coordinate v is the position of v:
// then swapping adjacent positions swaps two coordinates that differ by
// 1, which is exactly an edge of the polytope. (Placing π at its
// one-line vector instead would make some of these pairs diagonals.) For
// n = 3 that's a hexagon in a plane; for n = 4 it's a truncated
// octahedron in a 3-space, which we draw either as a solid you can turn
// (below) or as a Schlegel diagram (a perspective projection from just
// outside one hexagonal face).

type PermutohedronLayout = {
  pos: Map<string, Vec2>; // unit-radius coords keyed by one-line string
  edges: [string, string][];
};

const permKey = (perm: number[]) => perm.join("");

function inversePerm(perm: number[]): number[] {
  const inv: number[] = [];
  perm.forEach((v, i) => (inv[v - 1] = i + 1));
  return inv;
}

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
    xy: Vec2(project(inversePerm(perm).map((x) => x - mid))),
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

// ### The n = 4 permutohedron as a solid
//
// Drawn in 3D instead, the n = 4 permutohedron is a truncated
// octahedron. The map
//   x ↦ (x1+x2−x3−x4, x1−x2+x3−x4, x1−x2−x3+x4) / 2
// (on centered x = π⁻¹) is an isometry from the hyperplane Σx = 0 to
// R^3, and sends the vertices to the permutations of (0, ±1, ±2). Its 14
// faces are the facets Σ_{v∈S} π⁻¹(v) = 1 + ⋯ + |S| for nonempty proper
// subsets S of values: where the first |S| entries of π are S. |S| = 1
// or 3 gives a hexagon (S_1 × S_3), |S| = 2 a square (S_2 × S_2).

type Vec3 = [number, number, number];
const dot3 = (u: Vec3, v: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const sub3 = (u: Vec3, v: Vec3): Vec3 => [
  u[0] - v[0],
  u[1] - v[1],
  u[2] - v[2],
];
const cross3 = (u: Vec3, v: Vec3): Vec3 => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
const unit3 = (u: Vec3): Vec3 => {
  const l = Math.sqrt(dot3(u, u));
  return [u[0] / l, u[1] / l, u[2] / l];
};

type Polyhedron = {
  pos: Map<string, Vec3>; // unit circumradius
  /** Faces with their vertices in cyclic order. The (outward) normal is
   * along the centroid, since each facet is symmetric about it. */
  faces: { id: string; keys: string[]; square: boolean; normal: Vec3 }[];
  /** For each edge of `permutohedronLayout(4)`, the two faces on it. */
  edgeFaces: [number, number][];
};

const polyhedron4: Polyhedron = (() => {
  const { pos: pos2, edges } = permutohedronLayout(4);
  const pos = new Map<string, Vec3>();
  for (const key of pos2.keys()) {
    const [a, b, c, e] = inversePerm(key.split("").map(Number)).map(
      (x) => x - 2.5,
    );
    const s = 2 * Math.sqrt(5);
    pos.set(key, [
      (a + b - c - e) / s,
      (a - b + c - e) / s,
      (a - b - c + e) / s,
    ]);
  }
  const faces: Polyhedron["faces"] = [];
  for (let mask = 1; mask < 15; mask++) {
    const S = _.range(1, 5).filter((v) => mask & (1 << (v - 1)));
    const keys = [...pos.keys()].filter((key) =>
      S.every((v) => key.indexOf(String(v)) < S.length),
    );
    const pts = keys.map((key) => pos.get(key)!);
    const c: Vec3 = [0, 1, 2].map((k) => _.mean(pts.map((p) => p[k]))) as Vec3;
    const normal = unit3(c);
    const u = unit3(sub3(pts[0], c));
    const w = cross3(normal, u);
    const angle = (p: Vec3) => {
      const r = sub3(p, c);
      return Math.atan2(dot3(r, w), dot3(r, u));
    };
    faces.push({
      id: `ph-face-${S.join("")}`,
      keys: _.sortBy(keys, (key) => angle(pos.get(key)!)),
      square: S.length === 2,
      normal,
    });
  }
  const edgeFaces = edges.map(([a, b]) => {
    const fs = faces.flatMap((f, k) =>
      f.keys.includes(a) && f.keys.includes(b) ? [k] : [],
    );
    return [fs[0], fs[1]] as [number, number];
  });
  return { pos, faces, edgeFaces };
})();

/** A rotation, as a unit quaternion [w, x, y, z]. */
type Quat = [number, number, number, number];

/** Rotation by `angle` (radians) about the unit vector `axis`. */
function quatAxisAngle(axis: Vec3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}

/** `a` after `b`. */
function quatMul(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

function quatRotate([w, ...u]: Quat, v: Vec3): Vec3 {
  // v + 2w (u × v) + 2 u × (u × v)
  const t = cross3(u as Vec3, v).map((c) => 2 * c) as Vec3;
  const ut = cross3(u as Vec3, t);
  return [0, 1, 2].map((k) => v[k] + w * t[k] + ut[k]) as Vec3;
}

/** How the solid is turned (screen coordinates: x right, y up, z toward
 * the eye). A drag doesn't vary `orientation` itself: it varies `spin`,
 * a rotation vector in the screen plane (radians) applied on top, and the
 * drop folds it in. Turning about screen axes moves any grabbed point in
 * both directions on screen; Euler angles (yaw about the solid's own
 * axis) can't move a point near that axis sideways, so drags there
 * thrashed. */
type View = { orientation: Quat; spin: { x: number; y: number } };

function viewRotation({ orientation, spin: { x: sx, y: sy } }: View): Quat {
  const angle = Math.hypot(sx, sy);
  if (angle === 0) return orientation;
  return quatMul(
    quatAxisAngle([sx / angle, sy / angle, 0], angle),
    orientation,
  );
}

const foldSpin = (view: View): View => {
  const q = viewRotation(view);
  const len = Math.hypot(...q);
  return {
    orientation: q.map((c) => c / len) as Quat,
    spin: { x: 0, y: 0 },
  };
};

const EYE = 4; // eye distance, in circumradii

/** The cosine of the angle between face `k`'s normal and its line of
 * sight under `view`: positive when the face is turned toward the eye. */
function faceFacing(view: View, k: number): number {
  const q = viewRotation(view);
  const face = polyhedron4.faces[k];
  const toEye = sub3(
    [0, 0, EYE],
    quatRotate(q, polyhedron4.pos.get(face.keys[0])!),
  );
  return dot3(quatRotate(q, face.normal), unit3(toEye));
}

/** Turn the solid by `view` and project it in perspective onto the
 * screen (unit-ish radius, y down). Also says which faces face the eye. */
function projectPolyhedron(view: View) {
  const q = viewRotation(view);
  const rotate = (v: Vec3) => quatRotate(q, v);
  const pos = new Map<string, Vec2>();
  for (const [key, p] of polyhedron4.pos) {
    const r = rotate(p);
    const f = EYE / (EYE - r[2]);
    pos.set(key, Vec2(r[0] * f, -r[1] * f).mul(0.92));
  }
  const LIGHT = unit3([-0.5, 0.7, 0.8]);
  const faces = polyhedron4.faces.map((face, k) => ({
    ...face,
    pts: face.keys.map((key) => pos.get(key)!),
    front: faceFacing(view, k) > 0,
    light: Math.max(0, dot3(rotate(face.normal), LIGHT)),
  }));
  const edgeFront = polyhedron4.edgeFaces.map(
    ([f, g]) => faces[f].front || faces[g].front,
  );
  return { pos, faces, edgeFront };
}

/** Scale an "#rrggbb" color's channels by `k`. */
function shade(hex: string, k: number): string {
  const channel = (i: number) =>
    Math.round(_.clamp(parseInt(hex.slice(i, i + 2), 16) * k, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(1)}${channel(3)}${channel(5)}`;
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

/** Where everything goes. The demo page and the talk slide lay the same
 * draggable out differently; sizes of marks and text scale with the
 * piece they belong to. */
export type LabLayout = {
  width: number;
  height: number;
  /** Two-line notation: the top-left corner of its top row, and the
   * tile size. */
  twoLine: { origin: Vec2; ts: number };
  /** Cycle diagram: the left end of its center line. With `centerIn`,
   * the cycles are centered in a slot that wide instead. */
  cycle: { origin: Vec2; scale: number; centerIn?: number };
  matrix: { origin: Vec2; cs: number };
  /** Permutohedron: center, radius, and a scale for its marks (walk,
   * token, edges). */
  ph: { center: Vec2; r: number; marks: number };
  /** The word "π = s_i ⋯": baseline origin, font size, and the most
   * room its letters get. */
  word: { origin: Vec2; fontSize: number; maxWidth: number };
  /** The "length · inversions" line, if shown. */
  stats: Vec2 | null;
  /** Wiring diagram: the start of the top wire, the width of its column
   * area, row spacing, a scale for text and strokes, and the fewest
   * columns it has (it always has room for the longest reduced word
   * plus a few). */
  wiring: {
    origin: Vec2;
    width: number;
    rs: number;
    scale: number;
    minCols: number;
  };
  /** Headings and other static text. */
  annotations: (info: {
    n: number;
    solid: boolean;
    wiringFull: boolean;
  }) => Svgx;
};

export function label(text: string, pos: Vec2) {
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
export function section(title: string, pos: Vec2, width: number) {
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

function tileContents(v: number, TS: number, opts: { muted?: boolean } = {}) {
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
        fontSize={(17 * TS) / 34}
        fontWeight={500}
        fontFamily="system-ui, sans-serif"
        fill={opts.muted ? "#9ca3af" : "#1f2937"}
      >
        {v}
      </text>
    </g>
  );
}

/** The permutation lab, laid out by `L`. */
export const permutationLab =
  (L: LabLayout): Draggable<State> =>
  ({ state: rawState, d, draggedId, isTracking }) => {
    const TS = L.twoLine.ts;
    const { n, mode, phStyle, view } = rawState;
    // `cols` is the layout (may include zero-width closed columns left by
    // a cancel drop); `word` is the logical word all the math and drag
    // specs use, and `state` is the cleaned state they build on.
    const cols = rawState.word;
    const word: Letter[] = cols.filter((c): c is Letter => !isZeroWidth(c));
    const state: State = { n, word, mode, phStyle, view };
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
    const COLS = Math.max(L.wiring.minCols, (n * (n - 1)) / 2 + 4);
    const CAP = COLS - 1; // letters, leaving one spare column
    const canAppend = (k: number) => word.length + k <= CAP;

    // ### Rewrites shared by the wiring diagram and the permutohedron walk
    /** Insert s_i s_i before logical letter k. The drag starts from
     * `withClosedAt`, which has two zero-width columns there and is drawn
     * the same as `state`, so the pair widens from nothing. */
    const withClosedAt = (k: number, i: number): State => ({
      ...state,
      word: [
        ...word.slice(0, k),
        { closed: i },
        { closed: i },
        ...word.slice(k),
      ],
    });
    const insertAt = (k: number, i: number): State => ({
      ...state,
      word: [...word.slice(0, k), i, i, ...word.slice(k)],
    });
    /** Cancel the double letter at k, k+1, leaving blanks (drawn flat) so
     * nothing to the right moves mid-drag. Drag with `.onDrop(closeBlanks)`. */
    const gappedAt = (k: number): State => ({
      ...state,
      word: word.map((l, m) =>
        m === k || m === k + 1 ? { blank: colGenerator(l) } : l,
      ),
    });
    // blanks become zero-width closed columns, so the drop animation is a
    // horizontal slide
    const closeBlanks = (s: State): State => ({
      ...s,
      word: s.word.map((l) =>
        typeof l === "object" && "blank" in l ? { closed: l.blank } : l,
      ),
    });

    const tileDragSpec = (v: number) => {
      const i = perm.indexOf(v);
      if (mode === "adjacent") {
        // Only adjacent transpositions: each step multiplies by s_i and
        // writes a letter. Chaining lets one drag write a whole word.
        if (!canAppend(1)) return d.fixed(state);
        return d
          .closest([
            i > 0 &&
              d.between([
                state,
                { ...state, word: applyGenerator(word, i - 1) },
              ]),
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
            {tileContents(v, TS)}
          </g>
        );
      });

    // ### Word & inversion count
    const wordK = L.word.fontSize / 18;
    const letterW = Math.min(
      22 * wordK,
      L.word.maxWidth / Math.max(state.word.length, 1),
    );
    // Letters of the word with their column index and a stable id: the
    // pair of wires that cross there (suffixed if a pair crosses twice).
    // `j` is the layout column, `jl` the index in the logical word.
    const wordLetters = (() => {
      const arr = _.range(1, n + 1);
      const seen = new Set<string>();
      const letters: { i: number; j: number; jl: number; pairId: string }[] =
        [];
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
    const nLetters = wordLetters.length;

    // ### Two-line notation
    const twoLineOrigin = L.twoLine.origin;
    const tsK = TS / 34;

    // ### Cycle diagram
    const cycK = L.cycle.scale;
    const NODE_R = 12 * cycK;
    const cycleOrigin = L.cycle.origin;
    const cycles = cyclesOf(perm);
    const cycleLayout = (() => {
      let x = 0;
      const centers: Vec2[] = [];
      for (const cyc of cycles) {
        const r = cyc.length === 1 ? 0 : cycK * Math.max(22, 6 * cyc.length);
        centers.push(Vec2(x + r + NODE_R, 0));
        x += 2 * (r + NODE_R) + 14 * cycK;
      }
      const shift =
        L.cycle.centerIn === undefined
          ? Vec2(0, 0)
          : Vec2((L.cycle.centerIn - (x - 14 * cycK)) / 2, 0);
      const nodePos = new Map<number, Vec2>();
      const rings = cycles.map((cyc, c) => {
        const m = cyc.length;
        const r = m === 1 ? 0 : cycK * Math.max(22, 6 * m);
        const center = centers[c].add(shift);
        cyc.forEach((v, k) => {
          nodePos.set(v, center.add(Vec2.polarDeg(r, -90 + (360 * k) / m)));
        });
        return { center, r, cyc };
      });
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
    const CS = L.matrix.cs;
    const matK = CS / 24;
    const matrixOrigin = L.matrix.origin;

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
    const PH_R = L.ph.r;
    const phK = L.ph.marks;
    const phOrigin = L.ph.center;
    const ph: PermutohedronLayout =
      n <= 4 ? permutohedronLayout(n) : { pos: new Map(), edges: [] };
    const solid =
      n === 4 && phStyle === "solid" ? projectPolyhedron(view) : null;
    // The walk from the identity along the word (a path on the map). Its
    // segments go by layout column, like the wiring diagram's, so a blank
    // or closed column is a zero-length step and inserting or cancelling
    // s_i s_i doesn't renumber the steps after it. Its vertices (the
    // handles) go by logical index.
    const phStepKeys =
      n <= 4
        ? _.range(cols.length + 1).map((k) =>
            permKey(permFromWord(n, cols.slice(0, k))),
          )
        : [];
    const phVertexKeys =
      n <= 4
        ? _.range(word.length + 1).map((k) =>
            permKey(permFromWord(n, word.slice(0, k))),
          )
        : [];
    const tokenDragSpec = () =>
      !canAppend(1)
        ? d.fixed(state)
        : d
            .closest(
              _.range(n - 1).map((i) =>
                d.between([state, { ...state, word: applyGenerator(word, i) }]),
              ),
              // commit to an edge once out on it; the shortest edges are
              // only ~20px, so lock early
              { lockPast: 10 },
            )
            // targets are close together, so snap late
            .withSnapRadius(3, { chain: true });

    // ### Rewriting the walk
    //
    // The relations of the word are the 2-faces of the permutohedron, so
    // each rewrite pushes part of the walk across a face:
    //
    // - Commutation s_i s_k = s_k s_i: the walk turns a corner of a square.
    //   Drag the corner vertex diagonally across the square.
    // - Braid s_i s_k s_i = s_k s_i s_k: the walk goes three sides around a
    //   hexagon. Drag the middle edge across to the opposite (parallel)
    //   side; the edges on either side swing around with it.
    // - s_i s_i = e: the walk goes out along an edge and straight back.
    //   Push the spur's tip back to where it started.
    //
    // There's no rewrite gesture for the reverse, e = s_i s_i. (The token
    // can still walk out and back, since each of its steps appends.)
    const walkVertexMoves = (j: number): State[] => {
      const [a, b] = [word[j - 1], word[j]];
      if (typeof a !== "number" || typeof b !== "number") return [];
      if (Math.abs(a - b) >= 2) {
        const w = word.slice();
        [w[j - 1], w[j]] = [b, a];
        return [{ ...state, word: w }];
      }
      if (a === b) return [gappedAt(j - 1)];
      return [];
    };
    const walkVertexDragSpec = (j: number) => {
      const moves = walkVertexMoves(j).map((s) =>
        d.between([state, s]).onDrop(closeBlanks),
      );
      return moves.length === 0 ? d.fixed(state) : d.closest(moves);
    };

    /** The walk, its rewrite handles, and the token, drawn at `pos`.
     * `front(a, b)` says whether the edge (or, for a = b, the vertex) is on
     * the near side; `z` stacks the near and far parts. */
    const walkLayers = (
      pos: Map<string, Vec2>,
      front: (a: string, b: string) => boolean,
      z: { back: number; front: number; token: number },
    ) => {
      const at = (key: string) => pos.get(key)!.mul(PH_R);
      const tokenKey = permKey(perm);
      return [
        // One id'd segment per step so earlier steps never change shape,
        // plus a zero-length tip segment at the last vertex: when a step is
        // appended, the tip stretches along the new edge with the token.
        ...[...phStepKeys, tokenKey].map((key, k) => {
          if (k === 0) return null;
          const prev = phStepKeys[k - 1];
          const isFront = front(prev, key);
          const blank = k <= cols.length && typeof cols[k - 1] !== "number";
          return (
            <line
              id={`ph-walk-${k - 1}`}
              {...at(prev).xy1()}
              {...at(key).xy2()}
              dragologyZIndex={isFront ? z.front : z.back}
              stroke="#2563eb"
              strokeWidth={3 * phK}
              strokeLinecap="round"
              opacity={blank ? 0 : isFront ? 0.4 : 0.5}
            />
          );
        }),
        // braid handles: the middle edge of s_i s_k s_i
        ...wordLetters.map(({ jl: m }) => {
          if (!isBraidAt(word, m - 1)) return null;
          const id = `ph-edge-${m}`;
          const p = at(phVertexKeys[m]);
          const q = at(phVertexKeys[m + 1]);
          const mid = p.add(q).div(2);
          return (
            <g
              id={id}
              transform={translate(mid)}
              dragologyZIndex={
                front(phVertexKeys[m], phVertexKeys[m + 1]) ? z.front : z.back
              }
              dragologyOnDrag={() =>
                d.between([
                  byColumn(state),
                  byColumn({ ...state, word: braidAt(word, m - 1) }),
                ])
              }
              style={{ cursor: "grab" }}
            >
              <line
                {...p.sub(mid).xy1()}
                {...q.sub(mid).xy2()}
                stroke="#2563eb"
                strokeWidth={10 * phK}
                strokeLinecap="round"
                opacity={draggedId === id ? 0.35 : 0}
                className="plab-hit"
              />
            </g>
          );
        }),
        // vertex handles, where there's a move (not the last vertex: that's
        // the token)
        ...phVertexKeys.slice(0, -1).map((key, j) => {
          // (mid-cancel, a spur's tip sits next to a blank with no moves of
          // its own, but it's the handle being dragged)
          const midCancel = typeof word[j - 1] === "object";
          if (walkVertexMoves(j).length === 0 && !midCancel) return null;
          const id = `ph-v-${j}`;
          return (
            <g
              id={id}
              transform={translate(at(key))}
              dragologyZIndex={front(key, key) ? z.front : z.back}
              dragologyOnDrag={() => walkVertexDragSpec(j)}
              style={{ cursor: "grab" }}
            >
              <circle
                r={7 * phK}
                fill="#2563eb"
                opacity={draggedId === id ? 0.35 : 0}
                className="plab-hit"
              />
              <circle r={2.5 * phK} fill="#2563eb" opacity={0.7} />
            </g>
          );
        }),
        <g
          id="ph-token"
          transform={translate(at(tokenKey))}
          dragologyZIndex={z.token}
          dragologyOnDrag={tokenDragSpec}
          style={{ cursor: canAppend(1) ? "grab" : "not-allowed" }}
        >
          <circle
            r={8 * phK}
            fill="#2563eb"
            stroke="white"
            strokeWidth={2 * phK}
            opacity={front(tokenKey, tokenKey) ? 1 : 0.55}
          />
        </g>,
      ];
    };

    // The solid: faces, edges, walk and token, stacked by z-index from back
    // to front, so what's behind shows faintly through the front faces.
    // Faces are positioned by their centroids so that `d.vary` can follow a
    // grabbed face as it turns the solid.
    const solidView = (() => {
      if (!solid) return null;
      const edgeFront = new Map(
        ph.edges.map(([a, b], k) => [`${a}-${b}`, solid.edgeFront[k]]),
      );
      const isFront = (a: string, b: string) =>
        a === b
          ? solid.faces.some((f) => f.front && f.keys.includes(a))
          : edgeFront.get(a < b ? `${a}-${b}` : `${b}-${a}`)!;
      const edgeLines = (front: boolean) =>
        ph.edges.map(([a, b], k) => (
          <line
            {...solid.pos.get(a)!.mul(PH_R).xy1()}
            {...solid.pos.get(b)!.mul(PH_R).xy2()}
            stroke={front ? "#475569" : "#64748b"}
            strokeWidth={(front ? 1.25 : 1) * phK}
            strokeDasharray={front ? undefined : `${3 * phK} ${3 * phK}`}
            opacity={solid.edgeFront[k] === front ? 1 : 0}
          />
        ));
      return (
        <g id="ph-solid" transform={translate(phOrigin)}>
          {solid.faces.map((face, k) => {
            const c = face.pts
              .reduce((acc, p) => acc.add(p))
              .div(face.pts.length);
            const rel = face.pts.map((p) => p.sub(c).mul(PH_R));
            return (
              <g
                id={face.id}
                transform={translate(c.mul(PH_R))}
                dragologyZIndex={face.front ? 4 : 1}
                dragologyOnDrag={() => {
                  // Keep the grabbed face turned toward you. Otherwise, past
                  // the silhouette the grabbed point rolls onto the back,
                  // where the same screen position is reached by turning the
                  // other way, and dragging back turns the solid backwards.
                  // With this, the face stops nearly edge-on at the
                  // silhouette and dragging back retraces the turn. (A face
                  // that starts closer to edge-on than that keeps its start.)
                  const minFacing = Math.min(0.1, faceFacing(view, k));
                  return d
                    .vary(
                      { ...state, view: foldSpin(view) },
                      [param("view", "spin", "x"), param("view", "spin", "y")],
                      {
                        constraint: (s) =>
                          moreThan(faceFacing(s.view, k), minFacing),
                      },
                    )
                    .onDrop((s) => ({ ...s, view: foldSpin(s.view) }));
                }}
                style={{ cursor: "grab" }}
              >
                <path
                  d={`M ${rel.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`}
                  fill={shade(
                    face.square ? "#f5deb3" : "#d6e0ef",
                    0.84 + 0.2 * face.light,
                  )}
                  fillOpacity={face.front ? 0.72 : 0}
                />
              </g>
            );
          })}
          <g id="ph-edges-back" dragologyZIndex={2}>
            {edgeLines(false)}
          </g>
          <g id="ph-edges-front" dragologyZIndex={5}>
            {edgeLines(true)}
          </g>
          {walkLayers(solid.pos, isFront, { back: 3, front: 6, token: 7 })}
        </g>
      );
    })();
    // Turning the solid only moves the solid, so that's all the optimizer
    // needs to see.
    if (isTracking && draggedId?.startsWith("ph-face-"))
      return <g>{solidView}</g>;

    // ### Wiring diagram
    const RS = L.wiring.rs; // row spacing
    const wireK = L.wiring.scale;
    const wiringOrigin = L.wiring.origin;
    const rawLen = cols.length; // layout columns (incl. blank and closed)
    // The diagram always spans COLS column widths. Closed columns have zero
    // width.
    const CW = L.wiring.width / COLS; // column width
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
        return `M ${wireX0 - 14 * wireK} ${rowY(v - 1)} ${segs.join(" ")} L ${wireX1 + 14 * wireK} ${rowY(r)}`;
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
      return `M ${wireX0 - 14 * wireK} ${rowY(v - 1)} ${segs.join(" ")} L ${wireX1 + 14 * wireK} ${rowY(r)}`;
    };

    return (
      <g>
        <style>{`
        .plab-hit:hover { opacity: 0.35 !important; }
      `}</style>
        {L.annotations({ n, solid: !!solid, wiringFull: !canAppend(1) })}
        {/* ## Word & inversions */}
        <g transform={translate(L.word.origin)}>
          <text
            id="word-pi"
            fontSize={L.word.fontSize}
            fontFamily="Georgia, serif"
            fontStyle="italic"
            fill="#1f2937"
          >
            π =
          </text>
          {nLetters === 0 && (
            <text
              transform={translate(34 * wordK, 0)}
              fontSize={L.word.fontSize}
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
            <g
              id={`word-slot-${k}`}
              transform={translate(34 * wordK + k * letterW, 0)}
            />
          ))}
          {wordLetters.map(({ i, jl, pairId }) => (
            <text
              id={`word-letter-${pairId}`}
              dragologyEmergeFrom={`word-slot-${jl}`}
              dragologyEmergeMode="scale"
              transform={translate(34 * wordK + jl * letterW, 0)}
              fontSize={L.word.fontSize}
              fontFamily="Georgia, serif"
              fontStyle="italic"
              fill="#1f2937"
            >
              s{sub(i + 1)}
            </text>
          ))}
        </g>
        {L.stats && (
          <g transform={translate(L.stats)}>
            <text
              fontSize={13}
              fontFamily="system-ui, sans-serif"
              fill="#374151"
            >
              length {nLetters} · inversions {inv} ·{" "}
              {nLetters === inv
                ? "reduced ✓"
                : `not reduced (${nLetters - inv} to cancel)`}
            </text>
          </g>
        )}
        {/* ## Two-line notation */}
        {/* (the bottom row is the one-line notation) */}
        <g transform={translate(twoLineOrigin)}>
          <path
            d={`M ${-6 * tsK} ${-4 * tsK} Q ${-18 * tsK} ${TS + 4 * tsK} ${-6 * tsK} ${2 * TS + 12 * tsK}`}
            fill="none"
            stroke="#9ca3af"
            strokeWidth={1.5}
          />
          <path
            d={`M ${n * TS + 6 * tsK} ${-4 * tsK} Q ${n * TS + 18 * tsK} ${TS + 4 * tsK} ${n * TS + 6 * tsK} ${2 * TS + 12 * tsK}`}
            fill="none"
            stroke="#9ca3af"
            strokeWidth={1.5}
          />
          {_.range(1, n + 1).map((k) => (
            <g transform={translate((k - 1) * TS, 0)}>
              {tileContents(k, TS, { muted: true })}
            </g>
          ))}
        </g>
        {tileRow("tl-tile", twoLineOrigin.add(Vec2(0, TS + 8 * tsK)))}
        {/* ## Cycle diagram */}
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
                    d={`M ${-5 * cycK} ${-NODE_R + 3 * cycK} A ${8 * cycK} ${8 * cycK} 0 1 1 ${5 * cycK} ${-NODE_R + 3 * cycK}`}
                    fill="none"
                    stroke="#9ca3af"
                    strokeWidth={1.5 * cycK}
                  />
                  {arrowhead({
                    tip: Vec2(5 * cycK, -NODE_R + 3 * cycK),
                    direction: Vec2(-0.6, 1),
                    headLength: 6 * cycK,
                    headAngleRad: Math.PI / 3,
                    fill: "#9ca3af",
                  })}
                </g>
              ) : (
                cyc.map((a, k) => {
                  const b = cyc[(k + 1) % cyc.length];
                  const m = cyc.length;
                  const delta = Math.asin(Math.min(1, (NODE_R + 4 * cycK) / r));
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
                        strokeWidth={1.5 * cycK}
                      />
                      {arrowhead({
                        tip: p1,
                        direction: tangent,
                        headLength: 7 * cycK,
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
                  fontSize={13 * cycK}
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
              <line
                x1={k * CS}
                y1={0}
                x2={k * CS}
                y2={n * CS}
                stroke="#e5e7eb"
              />
              <line
                x1={0}
                y1={k * CS}
                x2={n * CS}
                y2={k * CS}
                stroke="#e5e7eb"
              />
            </g>
          ))}
          {_.range(1, n + 1).map((k) => (
            <g>
              <text
                transform={translate((k - 0.5) * CS, -7 * matK)}
                textAnchor="middle"
                fontSize={9 * matK}
                fill="#9ca3af"
                fontFamily="system-ui, sans-serif"
              >
                {k}
              </text>
              <text
                transform={translate(-7 * matK, (k - 0.5) * CS)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={9 * matK}
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
                <circle r={7 * matK} fill={c.stroke} />
              </g>
            );
          })}
        </g>
        {/* ## Permutohedron */}
        {solid ? (
          solidView
        ) : n <= 4 ? (
          <g id="ph-flat" transform={translate(phOrigin)}>
            {ph.edges.map(([a, b]) => (
              <line
                {...ph.pos.get(a)!.mul(PH_R).xy1()}
                {...ph.pos.get(b)!.mul(PH_R).xy2()}
                stroke="#d1d5db"
                strokeWidth={1}
              />
            ))}
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
            {walkLayers(ph.pos, () => true, { back: 1, front: 1, token: 2 })}
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
        <g transform={translate(wiringOrigin)}>
          {_.range(1, n + 1).map((v) => (
            <g>
              <text
                transform={translate(wireX0 - 22 * wireK, rowY(v - 1))}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11 * wireK}
                fill="#6b7280"
                fontFamily="system-ui, sans-serif"
              >
                {v}
              </text>
              {/* the strand's end label: drag it past a neighbor to add a
                crossing (appends s_row, chained) */}
              <g
                id={`wire-end-${v}`}
                transform={translate(
                  wireX1 + 22 * wireK,
                  rowY(perm.indexOf(v)),
                )}
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
                  fontSize={11 * wireK}
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
              strokeWidth={2.5 * wireK}
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
            const wordLen = word.length;
            const realCols = _.range(rawLen).filter(
              (j) => !isZeroWidth(cols[j]),
            );
            const layoutOf = (k: number) =>
              k < wordLen ? realCols[k] : rawLen;
            const edgeX = (k: number) => colX(layoutOf(k)) + CW;
            const rowAfter = (r: number, letter: Letter | null) =>
              typeof letter !== "number"
                ? r
                : r === letter
                  ? letter + 1
                  : r === letter + 1
                    ? letter
                    : r;
            const pairs = doublePairs(word);
            let rMut = v - 1;
            let kMut = 0;
            while (kMut <= wordLen) {
              // snapshot the loop variables so drag closures don't see
              // later mutations
              const k = kMut;
              const r = rMut;
              const id = `strand-${v}-${k}`;
              const letter: Letter | null = k < wordLen ? word[k] : null;
              const next = rowAfter(r, letter);
              // (pairing as in `doublePairs`, so the apex id matches the one
              // an insertion drag started from)
              if (typeof letter === "number" && next !== r && pairs.has(k)) {
                // apex of a double crossing at logical columns k, k+1
                handles.push(
                  <g
                    id={id}
                    transform={translate(edgeX(k), rowY(next))}
                    dragologyZIndex={1}
                    dragologyOnDrag={() =>
                      d.between([state, gappedAt(k)]).onDrop(closeBlanks)
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
                      // The branches only trade places where the strand
                      // crosses its start row, where both look like `state`,
                      // so switch instantly: their wire paths have different
                      // segment structures (zero-width columns on different
                      // wires, or by-column layout), and blending them
                      // kinks the neighbors.
                      return d
                        .closest([
                          braidSide === "above"
                            ? braided
                            : r > 0 &&
                              canAppend(2) &&
                              d.between([
                                withClosedAt(k, r - 1),
                                insertAt(k, r - 1),
                              ]),
                          braidSide === "below"
                            ? braided
                            : r < n - 1 &&
                              canAppend(2) &&
                              d.between([withClosedAt(k, r), insertAt(k, r)]),
                        ])
                        .withBranchTransition(false);
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

const WIDTH = 680;
const HEIGHT = 560;

const draggable = permutationLab({
  width: WIDTH,
  height: HEIGHT,
  twoLine: { origin: Vec2(38, 56), ts: 34 },
  cycle: { origin: Vec2(20, 216), scale: 1 },
  matrix: { origin: Vec2(330, 72), cs: 24 },
  ph: { center: Vec2(WIDTH - 88 - 12, 160), r: 88, marks: 1 },
  word: { origin: Vec2(20, 332), fontSize: 18, maxWidth: 350 },
  stats: Vec2(20, 362),
  wiring: {
    origin: Vec2(48, 420),
    width: WIDTH - 110,
    rs: 24,
    scale: 1,
    minCols: 13,
  },
  annotations: ({ n, solid, wiringFull }) => (
    <g>
      {section("the permutation π", Vec2(20, 16), 440)}
      {section("permutohedron", Vec2(WIDTH - 196, 16), 196)}
      {section("a word for π", Vec2(20, 290), WIDTH - 40)}
      {label("two-line notation", Vec2(20, 44))}
      {label("cycle diagram", Vec2(20, 162))}
      {label("permutation matrix", Vec2(330, 44))}
      {label("row i, column π(i)", Vec2(330, 72 + n * 24 + 14))}
      {label("vertex = π, walk = word", Vec2(WIDTH - 196, 44))}
      {solid && label("drag a face to turn it", Vec2(WIDTH - 196, 272))}
      {label(
        wiringFull
          ? "wiring diagram is full — cancel a double crossing, or reset"
          : "wiring diagram (drag crossings past each other, or a strand over its neighbor)",
        Vec2(20, 398),
      )}
    </g>
  ),
});

// turned so the walk to the initial permutation is in front
export const INITIAL_VIEW: View = {
  // yaw 160° about the vertical, then pitch −35° about the horizontal
  orientation: quatMul(
    quatAxisAngle([1, 0, 0], (-35 * Math.PI) / 180),
    quatAxisAngle([0, 1, 0], (160 * Math.PI) / 180),
  ),
  spin: { x: 0, y: 0 },
};

export const INITIAL_PERMS: Record<number, number[]> = {
  3: [2, 3, 1],
  4: [3, 1, 4, 2],
  5: [3, 5, 1, 4, 2],
  6: [3, 5, 1, 6, 4, 2],
};

export default demo(
  () => {
    const [n, setN] = useState(4);
    const [mode, setMode] = useState<Mode>("adjacent");
    const [phStyle, setPhStyle] = useState<PhStyle>("solid");
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
          write) a word. Push the walk across a face to rewrite the word the
          same ways: drag a corner across a square to commute, or the middle of
          three edges around a hexagon across it to braid; where the walk goes
          out along an edge and straight back, push the tip back to cancel the s
          <sub>i</sub>s<sub>i</sub>. For n = 4 the permutohedron is a truncated
          octahedron: drag a face to turn it.
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
          <ConfigRadio
            label="Permutohedron (n = 4)"
            value={phStyle}
            onChange={setPhStyle}
            options={{
              solid: "solid (drag a face to turn it)",
              schlegel: "Schlegel diagram",
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
            phStyle,
            view: INITIAL_VIEW,
          }}
          stateOverride={{ mode, phStyle }}
          width={WIDTH}
          height={HEIGHT}
        />
      </div>
    );
  },
  {
    // The Schlegel diagram and n = 3 are only reachable from the config
    // panel.
    fuzz: [
      { name: "solid", n: 4, phStyle: "solid" as const },
      { name: "schlegel", n: 4, phStyle: "schlegel" as const },
      { name: "n3", n: 3, phStyle: "solid" as const },
    ].map(({ name, n, phStyle }) => ({
      name,
      draggable,
      initialState: {
        n,
        word: wordFromPerm(INITIAL_PERMS[n]),
        mode: "adjacent" as const,
        phStyle,
        view: INITIAL_VIEW,
      },
    })),
    tags: [
      "d.between",
      "d.closest",
      "d.vary",
      "spec.whenFar",
      "spec.withFloating",
      "spec.withSnapRadius [chain]",
      "produceAmb",
      "reordering",
      "math",
    ],
  },
);
