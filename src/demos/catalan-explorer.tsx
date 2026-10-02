import _ from "lodash";
import { useMemo, useState } from "react";
import { demo } from "../demo";
import {
  ConfigCheckbox,
  ConfigPanel,
  ConfigSelect,
  DemoDraggable,
  DemoNotes,
  DemoWithConfig,
} from "../demo/ui";
import { Draggable } from "../draggable";
import { DragSpecBuilder } from "../DragSpec";
import { Svgx } from "../svgx";
import { draggableLine, scale, translate } from "../svgx/helpers";

// # Catalan objects
//
// The canonical representation is a full binary tree with n internal
// nodes. Each internal node has a persistent `id` (it corresponds to a
// triangle, a tree node, and a hump of the Dyck path) and a persistent
// `edgeId` for the edge to its parent (it corresponds to a diagonal, a
// tree edge, and a pair of parentheses). A rotation keeps both nodes'
// `id`s and swaps their `edgeId`s – that's what makes the flipped
// diagonal / sliding paren pair animate as a single object.

type Leaf = { type: "leaf" };
type Node = {
  type: "node";
  id: string;
  edgeId: string;
  /**
   * Which way round the diagonal for this edge is drawn (angle + 180°).
   * Geometrically meaningless, but it decides which way the diagonal
   * rotates when it flips – see `flipVariants`.
   */
  edgeReversed: boolean;
  /**
   * Whether the tree-view line for this edge is drawn parent→child
   * instead of child→parent. Toggled every time the edge is rotated, so
   * that the line's two ends stay attached to the same two nodes while
   * the nodes swap roles.
   */
  edgeFlipped: boolean;
  /**
   * Which edge of this node's triangle was involved in the most recent
   * flip. The triangle's corners are listed active-edge-first, so that
   * during a flip its shared edge interpolates exactly like the
   * diagonal. Set on both the start and end states of a move by
   * `flipVariants`.
   */
  active: Side;
  left: Tree;
  right: Tree;
};
type Tree = Leaf | Node;
type Side = "top" | "left" | "right";

type State = { root: Node };

const LEAF: Leaf = { type: "leaf" };

const LETTERS = "abcdefg";

type Shape = number | [Shape, Shape];

function treeFromShape(shape: Shape): Tree {
  if (typeof shape === "number") return LEAF;
  return {
    type: "node",
    id: "",
    edgeId: "",
    edgeReversed: false,
    edgeFlipped: false,
    active: "top",
    left: treeFromShape(shape[0]),
    right: treeFromShape(shape[1]),
  };
}

/** Assign ids in preorder: n0, n1, ...; edge ids e1, e2, ... (root: "root"). */
function relabel(root: Node): Node {
  let count = 0;
  function go(t: Tree): Tree {
    if (t.type === "leaf") return t;
    const k = count++;
    return {
      type: "node",
      id: `n${k}`,
      edgeId: k === 0 ? "root" : `e${k}`,
      edgeReversed: false,
      edgeFlipped: false,
      active: "top",
      left: go(t.left),
      right: go(t.right),
    };
  }
  return go(root) as Node;
}

const initialShapes: Record<number, Shape> = {
  3: [
    [0, 1],
    [2, 3],
  ],
  4: [
    [0, [1, 2]],
    [3, 4],
  ],
  5: [
    [0, [1, 2]],
    [[3, 4], 5],
  ],
};

function initialState(n: number): State {
  return { root: relabel(treeFromShape(initialShapes[n]) as Node) };
}

function leafCount(t: Tree): number {
  return t.type === "leaf" ? 1 : leafCount(t.left) + leafCount(t.right);
}

function nodeCount(t: Tree): number {
  return t.type === "leaf" ? 0 : 1 + nodeCount(t.left) + nodeCount(t.right);
}

/**
 * Rotate the node with id `target` up above its parent.
 *   x(y(A,B),C) → y(A,x(B,C))     x(A,y(B,C)) → y(x(A,B),C)
 * Node ids stay put; edges (id + orientation) are swapped between x and y.
 */
function rotateUp(t: Tree, target: string): Tree {
  if (t.type === "leaf") return t;
  const { left, right } = t;
  if (left.type === "node" && left.id === target) {
    const y = left;
    return {
      ...y,
      edgeId: t.edgeId,
      edgeReversed: t.edgeReversed,
      edgeFlipped: t.edgeFlipped,
      left: y.left,
      right: {
        ...t,
        edgeId: y.edgeId,
        edgeReversed: y.edgeReversed,
        edgeFlipped: !y.edgeFlipped,
        left: y.right,
        right: t.right,
      },
    };
  }
  if (right.type === "node" && right.id === target) {
    const y = right;
    return {
      ...y,
      edgeId: t.edgeId,
      edgeReversed: t.edgeReversed,
      edgeFlipped: t.edgeFlipped,
      left: {
        ...t,
        edgeId: y.edgeId,
        edgeReversed: y.edgeReversed,
        edgeFlipped: !y.edgeFlipped,
        left: t.left,
        right: y.left,
      },
      right: y.right,
    };
  }
  return { ...t, left: rotateUp(left, target), right: rotateUp(right, target) };
}

function setNode(t: Tree, nodeId: string, props: Partial<Node>): Tree {
  if (t.type === "leaf") return t;
  if (t.id === nodeId) return { ...t, ...props };
  return {
    ...t,
    left: setNode(t.left, nodeId, props),
    right: setNode(t.right, nodeId, props),
  };
}

type Move = { from: State; to: State };

/**
 * Rotating `target` up above its parent, as a pair of states to
 * interpolate between. `from` renders identically to `state` but with
 * the two triangles next to the flipped diagonal marked `active` on
 * that edge, so their corners pair up with the diagonal's ends.
 *
 * There are two ways the diagonal's ends can travel to the ends of the
 * new diagonal. With one of them each neighboring triangle keeps its
 * own corners and just follows the diagonal (`to[0]`); with the other
 * the diagonal sweeps straight through both triangles, which collapse
 * to a sliver at the midpoint and re-emerge (`to[1]`). Which is which
 * is fixed by the tree: the good one always pairs the diagonal's
 * lower-indexed end with the new diagonal's higher-indexed end, i.e.
 * it toggles `edgeReversed`. The variants differ only in that bit.
 */
function flipVariants(
  state: State,
  target: string,
): { from: State; to: [State, State] } {
  const before = analyze(state.root);
  const y = before.get(target)!;
  const x = y.parent!;
  const side = y.side!;
  const fromRoot = setNode(
    setNode(state.root, x.id, { active: side }),
    target,
    {
      active: "top",
    },
  ) as Node;

  // after the rotation, x hangs off y on the other side
  const rotated = setNode(
    setNode(rotateUp(state.root, target), target, {
      active: side === "right" ? "left" : "right",
    }),
    x.id,
    { active: "top" },
  ) as Node;
  // the flipped diagonal is y's old edge, now on x; rotateUp carried
  // its `edgeReversed` bit along unchanged
  const rev = (analyze(rotated).get(x.id)!.node as Node).edgeReversed;
  const keep: State = { root: rotated };
  const swap: State = {
    root: setNode(rotated, x.id, { edgeReversed: !rev }) as Node,
  };
  return { from: { root: fromRoot }, to: [swap, keep] };
}

function flipMove(state: State, target: string): Move {
  const { from, to } = flipVariants(state, target);
  return { from, to: to[0] };
}

type NodeInfo = {
  node: Node;
  parent: Node | null;
  side: "left" | "right" | null;
  depth: number;
  /** first leaf index in this node's span */
  lo: number;
  /** last leaf index in this node's span */
  hi: number;
  /** first leaf index of the right subtree */
  split: number;
  /** in-order index among all 2n+1 nodes (leaves have index 2i) */
  inorder: number;
};

function analyze(root: Node): Map<string, NodeInfo> {
  const infos = new Map<string, NodeInfo>();
  let leaf = 0;
  let inorder = 0;
  function visit(
    t: Tree,
    parent: Node | null,
    side: "left" | "right" | null,
    depth: number,
  ) {
    if (t.type === "leaf") {
      leaf++;
      inorder++;
      return;
    }
    const lo = leaf;
    visit(t.left, t, "left", depth + 1);
    const split = leaf;
    const io = inorder++;
    visit(t.right, t, "right", depth + 1);
    infos.set(t.id, {
      node: t,
      parent,
      side,
      depth,
      lo,
      hi: leaf - 1,
      split,
      inorder: io,
    });
  }
  visit(root, null, null, 0);
  return infos;
}

/** Dyck word via w(node) = w(left) U w(right) D. */
type Step = { dir: "U" | "D"; id: string };
function dyckSteps(t: Tree): Step[] {
  if (t.type === "leaf") return [];
  return [
    ...dyckSteps(t.left),
    { dir: "U", id: t.id },
    ...dyckSteps(t.right),
    { dir: "D", id: t.id },
  ];
}

function shapeKey(t: Tree): string {
  return dyckSteps(t)
    .map((s) => s.dir)
    .join("");
}

type Token =
  | { kind: "letter"; index: number }
  | { kind: "open" | "close"; edgeId: string };
function parenTokens(root: Node): Token[] {
  let leaf = 0;
  function go(t: Tree, isRoot: boolean): Token[] {
    if (t.type === "leaf") return [{ kind: "letter", index: leaf++ }];
    return [
      ...(isRoot ? [] : [{ kind: "open", edgeId: t.edgeId } as Token]),
      ...go(t.left, false),
      ...go(t.right, false),
      ...(isRoot ? [] : [{ kind: "close", edgeId: t.edgeId } as Token]),
    ];
  }
  return go(root, true);
}

// # Colors
//
// Only nodes are colored (pastel triangles, tree nodes, Dyck bands).
// Edges (diagonals, tree edges, paren pairs) are all one neutral color:
// a node's color is canonical, while an edge's identity isn't (going
// around a cycle of flips permutes them), so coloring edges makes them
// shift hue or shuffle.

const NODE_FILLS = ["#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#ddd6fe"];
const NODE_STROKES = ["#ca8a04", "#15803d", "#1d4ed8", "#be185d", "#6d28d9"];
const EDGE_COLOR = "#334155";

const idNum = (id: string) => parseInt(id.slice(1), 10);
const nodeFill = (id: string) => NODE_FILLS[idNum(id) % NODE_FILLS.length];
const nodeStroke = (id: string) =>
  NODE_STROKES[idNum(id) % NODE_STROKES.length];

// # The Tamari lattice
//
// Drawn as a linear projection of Loday's realization of the
// associahedron (node i in in-order ↦ c_i = |left leaves|·|right
// leaves|), so drawn edges are shadows of the polytope's edges and each
// edge class stays parallel. Height is a functional Σ w_i·c_i with w
// increasing, which is strictly monotone along rotations, so every edge
// points up: the left comb is at the bottom, the right comb at the top.
// The projection is chosen to keep every vertex well clear of the other
// vertices and of edges it isn't on – a layered layout can't, because
// the lattice isn't graded and some edges skip levels.

type LatticeVertex = { key: string; tree: Node; x: number; y: number };
type Lattice = {
  vertices: LatticeVertex[];
  byKey: Map<string, LatticeVertex>;
  /** [key, key, class]: class = which two in-order positions rotate */
  edges: [string, string, string][];
  /** every edge class, in legend order */
  classes: string[];
};

// # Edge classes
//
// A rotation involves two internal nodes; their in-order positions
// (i, j) are unchanged by the rotation, and in Loday's realization every
// rotation of the same (i, j) is an edge parallel to e_j − e_i. So
// coloring lattice edges by (i, j) is fixed, and parallel edges of the
// associahedron share a color.

const CLASS_COLORS = [
  "#e11d48",
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#7c3aed",
  "#ea580c",
];

/** In-order position (0-based, among internal nodes) of a node. */
const slot = (info: NodeInfo) => (info.inorder - 1) / 2;

function edgeClass(child: NodeInfo, parent: NodeInfo): string {
  const [i, j] = _.sortBy([slot(child), slot(parent)]);
  return `${i}-${j}`;
}

function allEdgeClasses(n: number): string[] {
  return _.range(n).flatMap((i) => _.range(i + 1, n).map((j) => `${i}-${j}`));
}

function classColor(cls: string, classes: string[]) {
  return CLASS_COLORS[classes.indexOf(cls) % CLASS_COLORS.length];
}

function allTrees(n: number): Tree[] {
  if (n === 0) return [LEAF];
  const result: Tree[] = [];
  for (let k = 0; k < n; k++) {
    for (const left of allTrees(k)) {
      for (const right of allTrees(n - 1 - k)) {
        result.push({
          type: "node",
          id: "",
          edgeId: "",
          edgeReversed: false,
          edgeFlipped: false,
          active: "top",
          left,
          right,
        });
      }
    }
  }
  return result;
}

function lodayCoords(root: Node): number[] {
  const coords: number[] = [];
  function go(t: Tree) {
    if (t.type === "leaf") return;
    go(t.left);
    coords.push(leafCount(t.left) * leafCount(t.right));
    go(t.right);
  }
  go(root);
  return coords;
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

const latticeCache = new Map<string, Lattice>();

function getLattice(
  n: number,
  width: number,
  height: number,
  vertexR: number,
): Lattice {
  const cacheKey = `${n}-${width}-${height}-${vertexR}`;
  const cached = latticeCache.get(cacheKey);
  if (cached) return cached;

  const trees = allTrees(n).map((t) => relabel(t as Node));
  const keys = trees.map(shapeKey);
  const coords = trees.map(lodayCoords);
  const keyIndex = new Map(keys.map((k, i) => [k, i]));
  const edges: [string, string, string][] = [];
  trees.forEach((tree, i) => {
    const infos = analyze(tree);
    for (const info of infos.values()) {
      if (info.side !== "left") continue;
      // rotating a left child up is a right rotation: goes up in Tamari
      const j = keyIndex.get(shapeKey(rotateUp(tree, info.node.id)))!;
      edges.push([
        keys[i],
        keys[j],
        edgeClass(info, infos.get(info.parent!.id)!),
      ]);
    }
  });

  const ends = edges.map(([a, b]) => [keyIndex.get(a)!, keyIndex.get(b)!]);

  // Project onto functionals wx (horizontal) and wy (vertical), scaled
  // to fill the box. Every edge points up for any strictly increasing
  // wy: a rotation moves Loday's point along e_j − e_i with i < j.
  const project = (w: number[], size: number) => {
    const raw = coords.map((c) => _.sum(c.map((v, i) => v * w[i])));
    const [lo, hi] = [_.min(raw)!, _.max(raw)!];
    return raw.map((v) => ((v - lo) / (hi - lo || 1)) * size);
  };
  // Don't stretch small lattices across the whole width.
  const drawnWidth = Math.min(width, 1.5 * height);
  const layout = (wx: number[], wy: number[]) => ({
    xs: project(wx, drawnWidth).map((x) => x + (width - drawnWidth) / 2),
    ys: project(wy, height).map((y) => height - y),
  });

  // Room around the tightest vertex: its distance to the nearest edge
  // it isn't on, or half its distance to the nearest other vertex.
  const clearance = ({ xs, ys }: { xs: number[]; ys: number[] }) => {
    let min = Infinity;
    for (let i = 0; i < trees.length; i++) {
      for (let j = i + 1; j < trees.length; j++) {
        min = Math.min(min, Math.hypot(xs[i] - xs[j], ys[i] - ys[j]) / 2);
      }
      for (const [a, b] of ends) {
        if (a === i || b === i) continue;
        const dx = xs[b] - xs[a];
        const dy = ys[b] - ys[a];
        const t = _.clamp(
          ((xs[i] - xs[a]) * dx + (ys[i] - ys[a]) * dy) / (dx * dx + dy * dy),
          0,
          1,
        );
        min = Math.min(
          min,
          Math.hypot(xs[a] + t * dx - xs[i], ys[a] + t * dy - ys[i]),
        );
      }
    }
    return min;
  };

  // Edges run from lower to upper vertex. Score how steep the flattest
  // one is alongside clearance, so none lies nearly flat.
  const minRise = ({ ys }: { ys: number[] }) =>
    Math.min(...ends.map(([a, b]) => ys[a] - ys[b]));

  // Mirroring a tree reverses its Loday coordinates and turns the
  // lattice upside down. A palindromic wx, and a wy whose steps are
  // palindromic, make the drawing mirror-symmetric top to bottom, with
  // both combs on one vertical. So search over the free halves.
  const half = Math.ceil(n / 2);
  const stepHalf = Math.ceil((n - 1) / 2);
  const palindrome = (h: number[], len: number) =>
    _.range(len).map((i) => h[Math.min(i, len - 1 - i)]);
  const weights = (xh: number[], yh: number[]) => {
    const steps = palindrome(yh, n - 1);
    return {
      wx: palindrome(xh, n),
      wy: _.range(n).map((i) => _.sum(steps.slice(0, i))),
    };
  };

  // Random search, then hill-climb from the roomiest. Seeded, so the
  // layout is the same every time.
  const rand = mulberry32(n);
  let bestX = _.range(half).map((i) => i * i);
  let bestY = _.range(stepHalf).map(() => 1);
  let best = -Infinity;
  const consider = (xh: number[], yh: number[]) => {
    if (yh.some((v) => v <= 0.02)) return;
    const { wx, wy } = weights(xh, yh);
    const l = layout(wx, wy);
    const score = Math.min(clearance(l), minRise(l));
    if (score > best) [best, bestX, bestY] = [score, xh, yh];
  };
  for (let trial = 0; trial < 1500; trial++) {
    consider(
      _.range(half).map(() => rand() - 0.5),
      _.range(stepHalf).map(() => 0.05 + rand()),
    );
  }
  for (let step = 0; step < 1500; step++) {
    const size = 0.2 * (1 - step / 1500);
    consider(
      bestX.map((v) => v + (rand() - 0.5) * size),
      bestY.map((v) => v + (rand() - 0.5) * size),
    );
  }
  const { wx, wy } = weights(bestX, bestY);
  const { xs, ys } = layout(wx, wy);

  // A flat projection can't always leave enough room (n = 5 is a 4D
  // polytope), so then nudge vertices off whatever they crowd, keeping
  // every edge pointing up. Vertices move in mirror pairs, reflected
  // across the middle, to keep the symmetry.
  const coordIndex = new Map(coords.map((c, i) => [c.join(), i]));
  const mirror = coords.map((c) => coordIndex.get([...c].reverse().join())!);
  const needVE = vertexR + 5;
  const needVV = 2 * vertexR + 8;
  const incident = trees.map((_t, i) =>
    ends.filter(([a, b]) => a === i || b === i),
  );
  const segDist = (i: number, a: number, b: number) => {
    const dx = xs[b] - xs[a];
    const dy = ys[b] - ys[a];
    const t = _.clamp(
      ((xs[i] - xs[a]) * dx + (ys[i] - ys[a]) * dy) / (dx * dx + dy * dy),
      0,
      1,
    );
    return Math.hypot(xs[a] + t * dx - xs[i], ys[a] + t * dy - ys[i]);
  };
  const hinge = (need: number, d: number) => Math.max(0, need - d) ** 2;
  // the penalty terms that involve vertex v
  const crowding = (v: number) => {
    let p = 0;
    for (let j = 0; j < trees.length; j++) {
      if (j !== v) p += hinge(needVV, Math.hypot(xs[v] - xs[j], ys[v] - ys[j]));
    }
    for (const [a, b] of ends) {
      if (a !== v && b !== v) p += hinge(needVE, segDist(v, a, b));
    }
    for (const [a, b] of incident[v]) {
      for (let j = 0; j < trees.length; j++) {
        if (j !== a && j !== b) p += hinge(needVE, segDist(j, a, b));
      }
    }
    return p;
  };
  const riseFloor = minRise({ ys });
  const pointsUp = (v: number) =>
    incident[v].every(([a, b]) => ys[a] - ys[b] >= riseFloor);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  for (let step = 8; step >= 0.5; step /= 2) {
    for (let pass = 0; pass < 40; pass++) {
      let moved = false;
      for (let v = 0; v < trees.length; v++) {
        const m = mirror[v];
        if (m < v) continue;
        const pairCrowding = () => crowding(v) + (m === v ? 0 : crowding(m));
        let current = pairCrowding();
        if (current === 0) continue;
        for (const [dx, dy] of dirs) {
          // a self-mirror vertex stays on the middle line
          if (m === v && dy !== 0) continue;
          const saved = [xs[v], ys[v], xs[m], ys[m]];
          xs[v] = xs[m] = _.clamp(saved[0] + dx * step, 0, width);
          ys[v] = _.clamp(saved[1] + dy * step, 0, height);
          if (m !== v) ys[m] = height - ys[v];
          const next = pointsUp(v) && pointsUp(m) ? pairCrowding() : Infinity;
          if (next < current) {
            current = next;
            moved = true;
          } else {
            [xs[v], ys[v], xs[m], ys[m]] = saved;
          }
        }
      }
      if (!moved) break;
    }
  }

  const vertices = trees.map((tree, i) => ({
    key: keys[i],
    tree,
    x: xs[i],
    y: ys[i],
  }));
  const lattice: Lattice = {
    vertices,
    byKey: new Map(vertices.map((v) => [v.key, v])),
    edges,
    classes: allEdgeClasses(n),
  };
  latticeCache.set(cacheKey, lattice);
  return lattice;
}

// # Layout

const W = 700;

const POLY_C = { x: 125, y: 150 };
const POLY_R = 95;

const TREE_ORIGIN = { x: 270, y: 60 };
const TREE_W = 200;
const TREE_DY = 30;

const DYCK_ORIGIN = { x: 510, y: 180 };
const DYCK_W = 170;

const PAIR_ORIGIN = { x: 520, y: 305 };
const PAIR_W = 170;

const PAREN_ORIGIN = { x: 265, y: 270 };
const PAREN_ADV = 18;

const LAT_ORIGIN = { x: 40, y: 350 };
const LAT_W = 560;
const LEVEL_DY = 46;
const latticeHeight = (n: number) => ((n * (n - 1)) / 2) * LEVEL_DY;
const canvasHeight = (n: number) => LAT_ORIGIN.y + latticeHeight(n) + 30;

function polygonVertex(k: number, m: number, r = POLY_R) {
  const theta = ((90 + 180 / m + (k * 360) / m) * Math.PI) / 180;
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

function polygonView(
  state: State,
  infos: Map<string, NodeInfo>,
  d: DragSpecBuilder<State>,
  n: number,
): Svgx {
  const m = n + 2;
  const V = _.range(m).map((k) => polygonVertex(k, m));
  const pt = (k: number) => `${V[k].x},${V[k].y}`;
  const nodes = [...infos.values()];
  return (
    <g transform={translate(POLY_C.x, POLY_C.y)}>
      {/* triangles */}
      {nodes.map(({ node, lo, split, hi }) => {
        // corners: the active edge's two ends (A end first), then apex
        let ends: [number, number, boolean];
        let apex: number;
        if (node.active === "left" && node.left.type === "node") {
          ends = [lo, split, node.left.edgeReversed];
          apex = hi + 1;
        } else if (node.active === "right" && node.right.type === "node") {
          ends = [split, hi + 1, node.right.edgeReversed];
          apex = lo;
        } else {
          ends = [lo, hi + 1, node.edgeReversed];
          apex = split;
        }
        const [u, v, rev] = ends;
        const corners = rev ? [v, u, apex] : [u, v, apex];
        return (
          <polygon
            id={`tri-${node.id}`}
            points={corners.map(pt).join(" ")}
            fill={nodeFill(node.id)}
            stroke="none"
          />
        );
      })}
      {/* outline */}
      <polygon
        points={V.map((_v, k) => pt(k)).join(" ")}
        fill="none"
        stroke="#334155"
        strokeWidth={1.5}
      />
      {/* root edge */}
      <line
        x1={V[0].x}
        y1={V[0].y}
        x2={V[m - 1].x}
        y2={V[m - 1].y}
        stroke="#334155"
        strokeWidth={4}
      />
      {/* side labels */}
      {_.range(n + 1).map((i) => {
        const a = V[i];
        const b = V[i + 1];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const len = Math.hypot(mid.x, mid.y);
        const out = { x: (mid.x / len) * 16, y: (mid.y / len) * 16 };
        return (
          <text
            transform={translate(mid.x + out.x, mid.y + out.y)}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={13}
            fontStyle="italic"
            fill="#475569"
          >
            {LETTERS[i]}
          </text>
        );
      })}
      {/* diagonals */}
      {nodes
        .filter(({ parent }) => parent !== null)
        .map(({ node, lo, hi }) => {
          // The grab line is drawn by `draggableLine`, so a point grabbed
          // partway along the diagonal goes to the same fraction along
          // the flipped one. The two ways of pairing the ends then give
          // different targets, so `d.closest` can tell which way the
          // user is swinging it.
          const [pa, pb] = node.edgeReversed
            ? [V[hi + 1], V[lo]]
            : [V[lo], V[hi + 1]];
          const onDrag = () => {
            const { from, to } = flipVariants(state, node.id);
            return d.closest(to.map((t) => d.between([from, t])));
          };
          return (
            <g id={`diag-${node.edgeId}`}>
              <line
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke={EDGE_COLOR}
                strokeWidth={3.5}
                strokeLinecap="round"
              />
              <line
                id={`diag-${node.edgeId}-grab`}
                {...draggableLine(pa, pb)}
                stroke="transparent"
                strokeWidth={16}
                strokeLinecap="round"
                dragologyOnDrag={onDrag}
              />
            </g>
          );
        })}
    </g>
  );
}

function treeView(
  state: State,
  infos: Map<string, NodeInfo>,
  d: DragSpecBuilder<State>,
  n: number,
  draggedId: string | null,
): Svgx {
  const ux = TREE_W / (2 * n);
  const leafDepth = n;
  const posOf = (inorder: number, depth: number) => ({
    x: inorder * ux,
    y: depth * TREE_DY,
  });
  const nodePos = (id: string) => {
    const info = infos.get(id)!;
    return posOf(info.inorder, info.depth);
  };
  const nodes = [...infos.values()];
  const R = 9;
  return (
    <g transform={translate(TREE_ORIGIN.x, TREE_ORIGIN.y)}>
      {/* edges to internal children */}
      {nodes
        .filter(({ parent }) => parent !== null)
        .map(({ node, parent }) => {
          // Child→parent, except that `edgeFlipped` toggles on every
          // rotation of this edge (which swaps the roles of its two
          // nodes), so each end of the line stays with its node.
          const ends = [nodePos(node.id), nodePos(parent!.id)];
          const [a, b] = node.edgeFlipped ? ends.reverse() : ends;
          return (
            <line
              id={`edge-${node.edgeId}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={EDGE_COLOR}
              strokeWidth={3}
              strokeLinecap="round"
            />
          );
        })}
      {/* edges to leaves */}
      {nodes.flatMap(({ node, lo, split }) =>
        (
          [
            [node.left, lo],
            [node.right, split],
          ] as const
        )
          .filter(([child]) => child.type === "leaf")
          .map(([, leafIndex]) => {
            const a = nodePos(node.id);
            const b = posOf(2 * leafIndex, leafDepth);
            return (
              <line
                id={`leafedge-${leafIndex}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#94a3b8"
                strokeWidth={1.5}
              />
            );
          }),
      )}
      {/* leaves */}
      {_.range(n + 1).map((i) => (
        <text
          transform={translate(posOf(2 * i, leafDepth))}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={14}
          fontStyle="italic"
          fill="#475569"
        >
          {LETTERS[i]}
        </text>
      ))}
      {/* internal nodes */}
      {nodes.map(({ node, parent }) => (
        <g
          id={`node-${node.id}`}
          transform={translate(nodePos(node.id))}
          dragologyZIndex={draggedId === `node-${node.id}` ? 2 : 1}
          style={{ cursor: parent ? "grab" : "default" }}
          dragologyOnDrag={
            parent !== null &&
            (() => {
              const m = flipMove(state, node.id);
              // On completing the rotation, chain into a new drag from
              // there, so one drag can rotate a node up several levels.
              return d
                .between([m.from, m.to])
                .withSnapRadius(1, { chain: true });
            })
          }
        >
          <circle
            r={R}
            fill={nodeFill(node.id)}
            stroke={nodeStroke(node.id)}
            strokeWidth={2}
          />
        </g>
      ))}
    </g>
  );
}

/**
 * The rotations that move a node's Dyck hump (equivalently, its arc in
 * the pairing). At most one each way, so the pointer's direction picks
 * one.
 */
function humpMoves(state: State, info: NodeInfo): Move[] {
  const moves: Move[] = [];
  // hump slides down-right: this node is a right child
  if (info.side === "right") moves.push(flipMove(state, info.node.id));
  // hump slides up-left: this node's left child is internal
  if (info.node.left.type === "node")
    moves.push(flipMove(state, info.node.left.id));
  return moves;
}

/** Drag through `moves`, chaining into the next drag on completing one. */
function slideSpec(d: DragSpecBuilder<State>, moves: Move[]) {
  return d
    .closest(moves.map((m) => d.between([m.from, m.to])))
    .withSnapRadius(1, { chain: true });
}

type DyckTiles = "strips" | "bands";

function dyckView(
  state: State,
  infos: Map<string, NodeInfo>,
  d: DragSpecBuilder<State>,
  n: number,
  tiles: DyckTiles,
): Svgx {
  const u = DYCK_W / (2 * n);
  const steps = dyckSteps(state.root);
  const pts: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  steps.forEach((s, i) => {
    const p = pts[i];
    pts.push({ x: p.x + u, y: p.y + (s.dir === "U" ? -u : u) });
  });
  const segsById = new Map<string, { a: number; b: number }[]>();
  steps.forEach((s, i) => {
    if (!segsById.has(s.id)) segsById.set(s.id, []);
    segsById.get(s.id)!.push({ a: i, b: i + 1 });
  });
  const humps = [...infos.values()].map((info) => ({
    info,
    moves: humpMoves(state, info),
  }));
  return (
    <g transform={translate(DYCK_ORIGIN.x, DYCK_ORIGIN.y)}>
      {/* grid */}
      {_.range(n + 1).map((k) => (
        <line
          x1={0}
          y1={-k * u}
          x2={2 * n * u}
          y2={-k * u}
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      ))}
      {_.range(2 * n + 1).map((k) => (
        <line
          x1={k * u}
          y1={0}
          x2={k * u}
          y2={-n * u}
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      ))}
      <line
        x1={0}
        y1={0}
        x2={2 * n * u}
        y2={0}
        stroke="#334155"
        strokeWidth={2}
      />
      {/* humps */}
      {humps.map(({ info, moves }) => {
        const segs = segsById.get(info.node.id)!;
        const anchor = pts[segs[0].a];
        // The area under the path tiles into one piece per node, either:
        // - a strip along the axis its hump slides on, from its up-step
        //   diagonally down to the baseline (a down-step keeps
        //   x + height fixed and an up-step adds 2, so each diagonal
        //   band of width 2 holds exactly one up-step), or
        // - a unit-high band from its up-step to its down-step, with
        //   nested humps sitting on top of it.
        const h = -anchor.y;
        const w = pts[segs[1].b].x - anchor.x;
        const tile =
          tiles === "strips"
            ? [
                [0, 0],
                [u, -u],
                [h + 2 * u, h],
                [h, h],
              ]
            : [
                [0, 0],
                [w, 0],
                [w - u, -u],
                [u, -u],
              ];
        return (
          <g
            id={`dyck-${info.node.id}`}
            transform={translate(anchor)}
            style={{ cursor: moves.length > 0 ? "grab" : "default" }}
            dragologyOnDrag={moves.length > 0 && (() => slideSpec(d, moves))}
          >
            <polygon
              points={tile.map(([x, y]) => `${x},${y}`).join(" ")}
              fill={nodeFill(info.node.id)}
            />
            {segs.map(({ a, b }) => {
              const line = (stroke: string, strokeWidth: number) => (
                <line
                  x1={pts[a].x - anchor.x}
                  y1={pts[a].y - anchor.y}
                  x2={pts[b].x - anchor.x}
                  y2={pts[b].y - anchor.y}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />
              );
              return (
                <g>
                  {line("transparent", 16)}
                  {line("#475569", 2.5)}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

// The pairing matches each up-step of the Dyck path with its down-step:
// one arc per node, nested like the humps.
function pairingView(
  state: State,
  infos: Map<string, NodeInfo>,
  d: DragSpecBuilder<State>,
  n: number,
): Svgx {
  const u = PAIR_W / (2 * n);
  const steps = dyckSteps(state.root);
  const pointX = (k: number) => (k + 0.5) * u;
  let depth = 0;
  const depthAt = steps.map((s) => (s.dir === "U" ? depth++ : --depth));
  return (
    <g transform={translate(PAIR_ORIGIN.x, PAIR_ORIGIN.y)}>
      {[...infos.values()].map((info) => {
        const id = info.node.id;
        const i = steps.findIndex((s) => s.id === id && s.dir === "U");
        const j = steps.findIndex((s) => s.id === id && s.dir === "D");
        const radius = (pointX(j) - pointX(i)) / 2;
        const moves = humpMoves(state, info);
        return (
          <g
            id={`arc-${id}`}
            // a unit semicircle, placed and sized by the transform so a
            // grabbed point follows the arc as it moves and resizes
            transform={translate(pointX(i) + radius, 0) + scale(radius)}
            // nested arcs draw over the ones around them
            dragologyZIndex={depthAt[i]}
            style={{ cursor: moves.length > 0 ? "grab" : "default" }}
            dragologyOnDrag={moves.length > 0 && (() => slideSpec(d, moves))}
          >
            <path
              d="M -1 0 A 1 1 0 0 1 1 0 Z"
              fill={nodeFill(id)}
              stroke={nodeStroke(id)}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
      {_.range(2 * n).map((k) => (
        <circle transform={translate(pointX(k), 0)} r={2.5} fill={EDGE_COLOR} />
      ))}
    </g>
  );
}

function parenView(
  state: State,
  infos: Map<string, NodeInfo>,
  d: DragSpecBuilder<State>,
): Svgx {
  const tokens = parenTokens(state.root);
  const byEdge = new Map<string, { open: number; close: number }>();
  tokens.forEach((t, i) => {
    if (t.kind === "letter") return;
    const entry = byEdge.get(t.edgeId) ?? { open: -1, close: -1 };
    entry[t.kind] = i;
    byEdge.set(t.edgeId, entry);
  });
  const nodeByEdge = new Map(
    [...infos.values()].map((info) => [info.node.edgeId, info.node]),
  );
  const slot = (i: number) => translate(i * PAREN_ADV, 0);
  const paren = (
    id: string,
    text: string,
    i: number,
    color: string,
    onDrag: () => ReturnType<typeof d.between>,
  ) => (
    <g
      id={id}
      transform={slot(i)}
      style={{ cursor: "grab" }}
      dragologyOnDrag={onDrag}
    >
      <rect
        transform={translate(-PAREN_ADV / 2, -14)}
        width={PAREN_ADV}
        height={28}
        fill="transparent"
      />
      <text
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={20}
        fontWeight={600}
        fill={color}
      >
        {text}
      </text>
    </g>
  );
  return (
    <g transform={translate(PAREN_ORIGIN.x, PAREN_ORIGIN.y)}>
      {tokens.map(
        (t, i) =>
          t.kind === "letter" && (
            <text
              id={`letter-${t.index}`}
              transform={slot(i)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={18}
              fontStyle="italic"
              fill="#334155"
            >
              {LETTERS[t.index]}
            </text>
          ),
      )}
      {[...byEdge.entries()].map(([edgeId, { open, close }]) => {
        const node = nodeByEdge.get(edgeId)!;
        const color = EDGE_COLOR;
        const onDrag = () => {
          const m = flipMove(state, node.id);
          return d.between([m.from, m.to]);
        };
        return (
          <g id={`paren-${edgeId}`}>
            {paren(`paren-open-${edgeId}`, "(", open, color, onDrag)}
            {paren(`paren-close-${edgeId}`, ")", close, color, onDrag)}
          </g>
        );
      })}
    </g>
  );
}

function miniTriangulation(tree: Node, r: number): Svgx {
  const n = nodeCount(tree);
  const m = n + 2;
  const V = _.range(m).map((k) => polygonVertex(k, m, r));
  const infos = analyze(tree);
  return (
    <g>
      <polygon
        points={V.map((v) => `${v.x},${v.y}`).join(" ")}
        fill="white"
        stroke="#94a3b8"
        strokeWidth={1}
      />
      <line
        x1={V[0].x}
        y1={V[0].y}
        x2={V[m - 1].x}
        y2={V[m - 1].y}
        stroke="#64748b"
        strokeWidth={2}
      />
      {[...infos.values()]
        .filter(({ parent }) => parent !== null)
        .map(({ lo, hi }) => (
          <line
            x1={V[lo].x}
            y1={V[lo].y}
            x2={V[hi + 1].x}
            y2={V[hi + 1].y}
            stroke="#64748b"
            strokeWidth={1.2}
          />
        ))}
    </g>
  );
}

function latticeView(
  state: State,
  infos: Map<string, NodeInfo>,
  d: DragSpecBuilder<State>,
  n: number,
  draggedId: string | null,
  showColors: boolean,
): Svgx {
  const miniR = n <= 4 ? 14 : 11;
  const lattice = getLattice(n, LAT_W, latticeHeight(n), miniR);
  const currentKey = shapeKey(state.root);
  const current = lattice.byKey.get(currentKey)!;
  const moves = [...infos.values()]
    .filter(({ parent }) => parent !== null)
    .map((info) => ({ move: flipMove(state, info.node.id) }));
  return (
    <g transform={translate(LAT_ORIGIN.x, LAT_ORIGIN.y)}>
      {lattice.edges.map(([a, b, cls]) => {
        const va = lattice.byKey.get(a)!;
        const vb = lattice.byKey.get(b)!;
        return (
          <line
            x1={va.x}
            y1={va.y}
            x2={vb.x}
            y2={vb.y}
            stroke={showColors ? classColor(cls, lattice.classes) : "#cbd5e1"}
            strokeWidth={1.5}
            opacity={showColors ? 0.45 : 1}
          />
        );
      })}
      {/* legend: edge color = which two operator slots re-associate */}
      {showColors && (
        <g transform={translate(LAT_W + 10, 0)}>
          {lattice.classes.map((cls, k) => {
            const [i, j] = cls.split("-").map(Number);
            return (
              <g transform={translate(0, k * 18)}>
                <line
                  x1={0}
                  y1={0}
                  x2={18}
                  y2={0}
                  stroke={classColor(cls, lattice.classes)}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
                <text
                  transform={translate(24, 0)}
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="#64748b"
                >
                  {`${LETTERS[i]}·${LETTERS[i + 1]}, ${LETTERS[j]}·${LETTERS[j + 1]}`}
                </text>
              </g>
            );
          })}
        </g>
      )}
      {lattice.vertices.map((v) => (
        <g transform={translate(v.x, v.y)}>
          {miniTriangulation(v.tree, miniR)}
        </g>
      ))}
      <g
        id="token"
        transform={translate(current.x, current.y)}
        dragologyZIndex={draggedId === "token" ? "/1" : 1}
        style={{ cursor: "grab" }}
        dragologyOnDrag={() =>
          // One two-point between per edge; the nearest edge wins. On
          // reaching a neighbor, snap there and chain into a new drag
          // from it, so one drag can walk several edges.
          d
            .closest(moves.map((m) => d.between([m.move.from, m.move.to])))
            .withSnapRadius(1, { chain: true })
        }
      >
        <circle
          r={miniR + 5}
          fill="rgba(51, 65, 85, 0.06)"
          stroke="#0f172a"
          strokeWidth={2.5}
        />
      </g>
    </g>
  );
}

function label(x: number, y: number, text: string): Svgx {
  return (
    <text
      transform={translate(x, y)}
      fontSize={11}
      fontWeight={600}
      letterSpacing={1}
      fill="#94a3b8"
    >
      {text.toUpperCase()}
    </text>
  );
}

function makeDraggable(
  n: number,
  showLatticeColors: boolean,
  dyckTiles: DyckTiles,
): Draggable<State> {
  return ({ state, d, draggedId }) => {
    const infos = analyze(state.root);
    return (
      <g fontFamily="system-ui, sans-serif">
        {label(20, 30, "triangulation")}
        {polygonView(state, infos, d, n)}
        {label(TREE_ORIGIN.x - 10, 30, "binary tree")}
        {treeView(state, infos, d, n, draggedId)}
        {label(DYCK_ORIGIN.x - 10, 30, "dyck path")}
        {dyckView(state, infos, d, n, dyckTiles)}
        {label(PAIR_ORIGIN.x - 10, 215, "pairing")}
        {pairingView(state, infos, d, n)}
        {label(PAREN_ORIGIN.x - 15, PAREN_ORIGIN.y - 24, "parenthesization")}
        {parenView(state, infos, d)}
        {label(20, LAT_ORIGIN.y - 30, "tamari lattice")}
        {latticeView(state, infos, d, n, draggedId, showLatticeColors)}
      </g>
    );
  };
}

export default demo(
  () => {
    const [n, setN] = useState(4);
    const [showLatticeColors, setShowLatticeColors] = useState(false);
    const [dyckTiles, setDyckTiles] = useState<DyckTiles>("strips");
    const draggable = useMemo(
      () => makeDraggable(n, showLatticeColors, dyckTiles),
      [n, showLatticeColors, dyckTiles],
    );
    return (
      <DemoWithConfig>
        <div>
          <DemoNotes>
            Six views of one Catalan object, all drawn from a single state. Drag
            a <b>diagonal</b> to flip it, drag a <b>tree node</b> up to rotate
            it, slide a <b>hump</b> of the Dyck path diagonally (a rotation
            moves a whole excursion past a down-step – the Tamari move, not a
            single peak flip) or its <b>arc</b> in the pairing, or slide a{" "}
            <b>parenthesis</b>. Every view animates the same move. Colors follow
            identity: each tree node shares its color with its triangle, its
            tile of the Dyck path, and its arc in the pairing. Below, the Tamari
            lattice: drag the ring along edges to walk the flip graph (left comb
            at the bottom, right comb at the top). With &ldquo;Color lattice
            edges&rdquo; on, edges are colored by which two operator slots the
            rotation re-associates – in Loday&apos;s associahedron these are
            exactly the parallel classes of edges. (These colors are unrelated
            to the ones above.)
          </DemoNotes>
          <DemoDraggable
            key={n}
            draggable={draggable}
            initialState={initialState(n)}
            width={W}
            height={canvasHeight(n)}
          />
        </div>
        <ConfigPanel>
          <ConfigSelect
            label="n"
            value={n}
            onChange={setN}
            options={[3, 4, 5] as const}
          />
          <ConfigCheckbox
            value={showLatticeColors}
            onChange={setShowLatticeColors}
          >
            Color lattice edges
          </ConfigCheckbox>
          <ConfigSelect
            label="Dyck tiles"
            value={dyckTiles}
            onChange={setDyckTiles}
            options={["strips", "bands"] as const}
            stringifyOption={(t) =>
              t === "strips" ? "diagonal strips" : "horizontal bands"
            }
          />
        </ConfigPanel>
      </DemoWithConfig>
    );
  },
  {
    // The band tiling is only reachable from the config panel.
    fuzz: (["strips", "bands"] as const).map((tiles) => ({
      name: tiles,
      draggable: makeDraggable(4, false, tiles),
      initialState: initialState(4),
    })),
    tags: [
      "d.between",
      "d.closest",
      "spec.withSnapRadius [chain]",
      "math",
      "fancy",
    ],
  },
);
