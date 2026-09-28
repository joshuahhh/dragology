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

type State = {
  n: number;
  word: Letter[];
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

function compact(word: Letter[]): number[] {
  return word.filter((l): l is number => l !== null);
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
const HEIGHT = 500;

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

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  const { n, word, mode } = state;
  const perm = permFromWord(n, word);
  const inv = inversions(perm);

  // Drag spec for a tile showing value `v` in a one-line-style row.
  // Shared by the one-line notation and the bottom row of the
  // two-line notation.
  const tileDragSpec = (v: number) => {
    const i = perm.indexOf(v);
    if (mode === "adjacent") {
      // Only adjacent transpositions: each step multiplies by s_i and
      // writes a letter. Chaining lets one drag write a whole word.
      return d
        .closest([
          i > 0 &&
            d.between([state, { ...state, word: applyGenerator(word, i - 1) }]),
          i < n - 1 &&
            d.between([state, { ...state, word: applyGenerator(word, i) }]),
        ])
        .withSnapRadius(10, { chain: true });
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

  // ### One-line notation
  const oneLineOrigin = Vec2(20, 32);

  // ### Word & inversion count
  const infoOrigin = Vec2(250, 32);
  const letterW = Math.min(22, 350 / Math.max(state.word.length, 1));
  // Letters of the word with their column index and a stable id: the
  // pair of wires that cross there (suffixed if a pair crosses twice).
  const wordLetters = (() => {
    const arr = _.range(1, n + 1);
    const seen = new Set<string>();
    const letters: { i: number; j: number; pairId: string }[] = [];
    word.forEach((i, j) => {
      if (i === null) return;
      const a = arr[i];
      const b = arr[i + 1];
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      let pairId = `${Math.min(a, b)}-${Math.max(a, b)}`;
      while (seen.has(pairId)) pairId += "x";
      seen.add(pairId);
      letters.push({ i, j, pairId });
    });
    return letters;
  })();
  const L = wordLetters.length;

  // ### Two-line notation
  const twoLineOrigin = Vec2(38, 108);

  // ### Cycle diagram
  const NODE_R = 12;
  const cycleOrigin = Vec2(20, 260);
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
  const matrixOrigin = Vec2(330, 124);

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
  const phOrigin = Vec2(WIDTH - PH_R - 12, 218);
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
  const wiringOrigin = Vec2(48, 356);
  const Lcols = word.length; // columns, including blank ones
  // The diagram always draws a fixed number of columns (padding the word
  // with straight columns), and every column is one cubic segment. So a
  // wire's path keeps the same structure when a crossing is appended,
  // and path interpolation only bends the new column — existing
  // crossings stay put mid-drag.
  const COLS = Math.max(13, Lcols + 1); // at least one spare column
  const CW = (WIDTH - 110) / COLS; // column width
  const wireX0 = 0;
  const wireX1 = wireX0 + COLS * CW;
  const rowY = (r: number) => r * RS;

  const wirePath = (v: number) => {
    let r = v - 1;
    let x = wireX0;
    let dstr = `M ${x - 14} ${rowY(r)} L ${x} ${rowY(r)}`;
    for (let j = 0; j < COLS; j++) {
      const i: Letter = j < Lcols ? word[j] : null;
      const next = i === null ? r : r === i ? i + 1 : r === i + 1 ? i : r;
      dstr += ` C ${x + CW / 2} ${rowY(r)} ${x + CW / 2} ${rowY(next)} ${x + CW} ${rowY(next)}`;
      r = next;
      x += CW;
    }
    dstr += ` L ${wireX1 + 14} ${rowY(r)}`;
    return dstr;
  };

  return (
    <g>
      <style>{`
        .plab-hit:hover { opacity: 0.35 !important; }
      `}</style>

      {/* ## One-line notation */}
      {label("one-line notation", oneLineOrigin.add(Vec2(0, -12)))}
      {tileRow("ol-tile", oneLineOrigin)}

      {/* ## Word & inversions */}
      {label(
        mode === "adjacent" ? "word (drag writes it)" : "word",
        infoOrigin.add(Vec2(0, -12)),
      )}
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
        {wordLetters.map(({ i, j, pairId }, k) => (
          <text
            id={`word-letter-${pairId}`}
            dragologyEmergeFrom={
              k === 0 ? "word-pi" : `word-letter-${wordLetters[k - 1].pairId}`
            }
            dragologyEmergeMode="scale"
            transform={translate(34 + j * letterW, 0)}
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
      {label("permutation matrix", matrixOrigin.add(Vec2(0, -12)))}
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
      {label("permutohedron", phOrigin.add(Vec2(-PH_R, -PH_R - 14)))}
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
              d
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
            style={{ cursor: "grab" }}
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
        "wiring diagram (drag crossings past each other, or a strand over its neighbor)",
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
              style={{ cursor: "ns-resize" }}
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
        {wordLetters.map(({ i, j, pairId }) => {
          const id = `cross-${pairId}`;
          const moves = crossingMoves(word, j);
          const center = Vec2(wireX0 + (j + 0.5) * CW, (i + 0.5) * RS);
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
                      .withSnapRadius(10, { chain: true })
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
          while (jMut <= Lcols) {
            // snapshot the loop variables so drag closures don't see
            // later mutations
            const j = jMut;
            const r = rMut;
            const letter: Letter = j < Lcols ? word[j] : null;
            const next =
              letter === null
                ? r
                : r === letter
                  ? letter + 1
                  : r === letter + 1
                    ? letter
                    : r;
            const id = `strand-${v}-${j}`;
            if (letter !== null && next !== r && word[j + 1] === letter) {
              // apex of a double crossing at columns j, j+1
              const gapped: State = {
                ...state,
                word: word.map((l, k) => (k === j || k === j + 1 ? null : l)),
              };
              handles.push(
                <g
                  id={id}
                  transform={translate((j + 1) * CW, rowY(next))}
                  dragologyZIndex={1}
                  dragologyOnDrag={() =>
                    d
                      .between([state, gapped])
                      .onDrop((s) => ({ ...s, word: compact(s.word) }))
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
            if (letter === null && j + 1 < Lcols && word[j + 1] === null) {
              // two blank columns (mid-cancel): the apex handle lands here
              handles.push(
                <g id={id} transform={translate((j + 1) * CW, rowY(r))} />,
              );
              jMut += 2;
              continue;
            }
            if (next === r) {
              // straight segment
              const insert = (i: number): State => ({
                ...state,
                word: [...word.slice(0, j), i, i, ...word.slice(j)],
              });
              handles.push(
                <g
                  id={id}
                  transform={translate((j + 0.5) * CW, rowY(r))}
                  dragologyZIndex={1}
                  dragologyOnDrag={() =>
                    d.closest([
                      r > 0 && d.between([state, insert(r - 1)]),
                      r < n - 1 && d.between([state, insert(r)]),
                    ])
                  }
                  style={{ cursor: "ns-resize" }}
                >
                  <rect
                    transform={translate(-CW * 0.4, -RS * 0.3)}
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
          One permutation, five notations, all in sync. Drag tiles in the
          one-line / two-line notation to reorder; switch to{" "}
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
