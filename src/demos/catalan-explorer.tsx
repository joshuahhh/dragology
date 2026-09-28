import _ from "lodash";
import { useMemo, useState } from "react";
import { demo } from "../demo";
import {
  ConfigPanel,
  ConfigSelect,
  DemoDraggable,
  DemoNotes,
  DemoWithConfig,
} from "../demo/ui";
import { Draggable } from "../draggable";
import { DragSpecBuilder } from "../DragSpec";
import { Svgx } from "../svgx";
import { rotateDeg, translate } from "../svgx/helpers";

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
  left: Tree;
  right: Tree;
};
type Tree = Leaf | Node;

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

function setEdgeReversed(t: Tree, nodeId: string, value: boolean): Tree {
  if (t.type === "leaf") return t;
  if (t.id === nodeId) return { ...t, edgeReversed: value };
  return {
    ...t,
    left: setEdgeReversed(t.left, nodeId, value),
    right: setEdgeReversed(t.right, nodeId, value),
  };
}

/** Shortest signed angular difference from a to b, in (-180, 180]. */
function angleDelta(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/**
 * The two states reachable by rotating `target` up. Both have the same
 * tree; they differ only in which way round the flipped diagonal is
 * drawn, i.e. which way it rotates from its current position: the first
 * is the short rotation (≤ 90°), the second the long one. Everything
 * except the polygon view renders them identically.
 */
function flipVariants(state: State, target: string, n: number): [State, State] {
  const before = analyze(state.root);
  const y = before.get(target)!;
  const x = y.parent!;
  const angleBefore = diagAngle(y.lo, y.hi, n, y.node.edgeReversed);
  const rotated = rotateUp(state.root, target) as Node;
  const after = analyze(rotated);
  // the flipped diagonal is y's old edge, now on x
  const xAfter = after.get(x.id)!;
  const geo = diagAngle(xAfter.lo, xAfter.hi, n, false);
  const shortIsReversed =
    Math.abs(angleDelta(angleBefore, geo + 180)) <
    Math.abs(angleDelta(angleBefore, geo));
  return [
    { root: setEdgeReversed(rotated, x.id, shortIsReversed) as Node },
    { root: setEdgeReversed(rotated, x.id, !shortIsReversed) as Node },
  ];
}

function rotateUpState(state: State, target: string, n: number): State {
  return flipVariants(state, target, n)[0];
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

const EDGE_COLORS = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#9333ea"];
const NODE_FILLS = ["#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#ddd6fe"];
const NODE_STROKES = ["#ca8a04", "#15803d", "#1d4ed8", "#be185d", "#6d28d9"];

const idNum = (id: string) => parseInt(id.slice(1), 10);
const edgeColor = (edgeId: string) =>
  EDGE_COLORS[(idNum(edgeId) - 1) % EDGE_COLORS.length];
const nodeFill = (id: string) => NODE_FILLS[idNum(id) % NODE_FILLS.length];
const nodeStroke = (id: string) =>
  NODE_STROKES[idNum(id) % NODE_STROKES.length];

// # The Tamari lattice
//
// Drawn as a layered Hasse diagram. Levels come from the linear
// functional Σ i·c_i on Loday's realization of the associahedron (node
// i in in-order ↦ c_i = |left leaves|·|right leaves|), which is strictly
// monotone along rotations, so every edge points up: the left comb is
// at the bottom, the right comb at the top. Within a level, vertices
// are ordered by barycenter sweeps.

type LatticeVertex = { key: string; tree: Node; x: number; y: number };
type Lattice = {
  vertices: LatticeVertex[];
  byKey: Map<string, LatticeVertex>;
  edges: [string, string][];
};

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

const latticeCache = new Map<string, Lattice>();

function getLattice(n: number, width: number, height: number): Lattice {
  const cacheKey = `${n}-${width}-${height}`;
  const cached = latticeCache.get(cacheKey);
  if (cached) return cached;

  const trees = allTrees(n).map((t) => relabel(t as Node));
  const keys = trees.map(shapeKey);
  const coords = trees.map(lodayCoords);
  const keyIndex = new Map(keys.map((k, i) => [k, i]));
  const edges: [string, string][] = [];
  const neighbors: number[][] = trees.map(() => []);
  const ups: number[][] = trees.map(() => []);
  trees.forEach((tree, i) => {
    for (const info of analyze(tree).values()) {
      if (info.side !== "left") continue;
      // rotating a left child up is a right rotation: goes up in Tamari
      const j = keyIndex.get(shapeKey(rotateUp(tree, info.node.id)))!;
      edges.push([keys[i], keys[j]]);
      neighbors[i].push(j);
      neighbors[j].push(i);
      ups[i].push(j);
    }
  });

  // f is strictly monotone along edges, so processing vertices in
  // decreasing-f order is a topological order (left comb first).
  const f = coords.map((c) => _.sum(c.map((v, i) => v * (i + 1))));
  const order = _.sortBy(_.range(trees.length), (i) => -f[i]);
  // rank = length of the longest chain from the bottom
  const rank = trees.map(() => 0);
  for (const i of order) {
    for (const j of ups[i]) rank[j] = Math.max(rank[j], rank[i] + 1);
  }
  const numLevels = Math.max(...rank) + 1;
  const levelOf = rank;
  const levels: number[][] = _.range(numLevels).map(() => []);
  // initial order within a level: a mirror-antisymmetric functional
  const g = coords.map((c) => _.sum(c.map((v, i) => v * (i - (n - 1) / 2))));
  trees.forEach((_t, i) => levels[levelOf[i]].push(i));
  for (const level of levels) level.sort((a, b) => g[a] - g[b]);

  const maxCount = Math.max(...levels.map((l) => l.length));
  const gap = Math.min(width / maxCount, 110);
  const xs = trees.map(() => 0);
  const place = () => {
    for (const level of levels) {
      level.forEach((i, k) => {
        xs[i] = width / 2 + (k - (level.length - 1) / 2) * gap;
      });
    }
  };
  place();
  for (let sweep = 0; sweep < 12; sweep++) {
    const order = sweep % 2 === 0 ? levels : [...levels].reverse();
    for (const level of order) {
      const bary = new Map(
        level.map((i) => {
          const others = neighbors[i].filter((j) => levelOf[j] !== levelOf[i]);
          return [i, others.length ? _.mean(others.map((j) => xs[j])) : xs[i]];
        }),
      );
      level.sort((a, b) => bary.get(a)! - bary.get(b)! || g[a] - g[b]);
      place();
    }
  }

  const vertices = trees.map((tree, i) => ({
    key: keys[i],
    tree,
    x: xs[i],
    y: height - (levelOf[i] / (numLevels - 1)) * height,
  }));
  const lattice: Lattice = {
    vertices,
    byKey: new Map(vertices.map((v) => [v.key, v])),
    edges,
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

const PAREN_ORIGIN = { x: 275, y: 270 };
const PAREN_ADV = 20;

const LAT_ORIGIN = { x: 40, y: 340 };
const LAT_W = 620;
const LEVEL_DY = 46;
const latticeHeight = (n: number) => ((n * (n - 1)) / 2) * LEVEL_DY;
const canvasHeight = (n: number) => LAT_ORIGIN.y + latticeHeight(n) + 30;

function polygonVertex(k: number, m: number, r = POLY_R) {
  const theta = ((90 + 180 / m + (k * 360) / m) * Math.PI) / 180;
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

/** Angle (degrees) of the diagonal spanning leaves lo..hi. */
function diagAngle(lo: number, hi: number, n: number, reversed: boolean) {
  const m = n + 2;
  const a = polygonVertex(lo, m);
  const b = polygonVertex(hi + 1, m);
  return (
    (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + (reversed ? 180 : 0)
  );
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
      {nodes.map(({ node, lo, split, hi }) => (
        <polygon
          id={`tri-${node.id}`}
          points={`${pt(lo)} ${pt(split)} ${pt(hi + 1)}`}
          fill={nodeFill(node.id)}
          stroke="none"
        />
      ))}
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
          const a = V[lo];
          const b = V[hi + 1];
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const half = Math.hypot(b.x - a.x, b.y - a.y) / 2;
          const angle = diagAngle(lo, hi, n, node.edgeReversed);
          const line = (stroke: string, strokeWidth: number) => (
            <line
              x1={-half}
              y1={0}
              x2={half}
              y2={0}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          );
          return (
            <g
              id={`diag-${node.edgeId}`}
              transform={translate(mid) + rotateDeg(angle)}
              style={{ cursor: "grab" }}
              dragologyOnDrag={() =>
                // Both ways the diagonal could rotate into its flipped
                // position; whichever keeps the grabbed point closest
                // to the pointer wins.
                d.closest(
                  flipVariants(state, node.id, n).map((v) =>
                    d.between([state, v]),
                  ),
                )
              }
            >
              {line("transparent", 16)}
              {line(edgeColor(node.edgeId), 3.5)}
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
              stroke={edgeColor(node.edgeId)}
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
            (() => d.between([state, rotateUpState(state, node.id, n)]))
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

function dyckView(
  state: State,
  infos: Map<string, NodeInfo>,
  d: DragSpecBuilder<State>,
  n: number,
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
  const humps = [...infos.values()].map((info) => {
    const moves: State[] = [];
    // hump slides down-right: this node is a right child
    if (info.side === "right")
      moves.push(rotateUpState(state, info.node.id, n));
    // hump slides up-left: this node's left child is internal
    if (info.node.left.type === "node")
      moves.push(rotateUpState(state, info.node.left.id, n));
    return { info, moves };
  });
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
        return (
          <g
            id={`dyck-${info.node.id}`}
            transform={translate(anchor)}
            style={{ cursor: moves.length > 0 ? "grab" : "default" }}
            dragologyOnDrag={
              moves.length > 0 &&
              (() => d.closest(moves.map((m) => d.between([state, m]))))
            }
          >
            {segs.map(({ a, b }, k) => {
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
                <g id={`dyck-${info.node.id}-${k}`}>
                  {line("transparent", 16)}
                  {line(nodeStroke(info.node.id), 4)}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

function parenView(
  state: State,
  infos: Map<string, NodeInfo>,
  d: DragSpecBuilder<State>,
  n: number,
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
        const color = edgeColor(edgeId);
        const onDrag = () =>
          d.between([state, rotateUpState(state, node.id, n)]);
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
): Svgx {
  const lattice = getLattice(n, LAT_W, latticeHeight(n));
  const miniR = n <= 4 ? 14 : 11;
  const currentKey = shapeKey(state.root);
  const current = lattice.byKey.get(currentKey)!;
  const moves = [...infos.values()]
    .filter(({ parent }) => parent !== null)
    .map(({ node }) => ({
      edgeId: node.edgeId,
      next: rotateUpState(state, node.id, n),
    }));
  return (
    <g transform={translate(LAT_ORIGIN.x, LAT_ORIGIN.y)}>
      {lattice.edges.map(([a, b]) => {
        const va = lattice.byKey.get(a)!;
        const vb = lattice.byKey.get(b)!;
        return (
          <line
            x1={va.x}
            y1={va.y}
            x2={vb.x}
            y2={vb.y}
            stroke="#cbd5e1"
            strokeWidth={1.5}
          />
        );
      })}
      {moves.map(({ edgeId, next }) => {
        const vb = lattice.byKey.get(shapeKey(next.root))!;
        return (
          <line
            id={`lat-edge-${edgeId}`}
            x1={current.x}
            y1={current.y}
            x2={vb.x}
            y2={vb.y}
            stroke={edgeColor(edgeId)}
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
      })}
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
          d
            .closest([state, ...moves.map((m) => m.next)])
            .withFloating({ ghost: { opacity: 0.35 } })
            .withChaining()
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

function makeDraggable(n: number): Draggable<State> {
  return ({ state, d, draggedId }) => {
    const infos = analyze(state.root);
    return (
      <g fontFamily="system-ui, sans-serif">
        {label(20, 30, "triangulation")}
        {polygonView(state, infos, d, n)}
        {label(TREE_ORIGIN.x - 10, 30, "binary tree")}
        {treeView(state, infos, d, n, draggedId)}
        {label(DYCK_ORIGIN.x - 10, 30, "dyck path")}
        {dyckView(state, infos, d, n)}
        {label(PAREN_ORIGIN.x - 15, PAREN_ORIGIN.y - 24, "parenthesization")}
        {parenView(state, infos, d, n)}
        {label(20, LAT_ORIGIN.y - 30, "tamari lattice")}
        {latticeView(state, infos, d, n, draggedId)}
      </g>
    );
  };
}

export default demo(
  () => {
    const [n, setN] = useState(4);
    const draggable = useMemo(() => makeDraggable(n), [n]);
    return (
      <DemoWithConfig>
        <div>
          <DemoNotes>
            Five views of one Catalan object, all drawn from a single state.
            Drag a <b>diagonal</b> to flip it, drag a <b>tree node</b> up to
            rotate it, slide a <b>hump</b> of the Dyck path diagonally (a
            rotation moves a whole excursion past a down-step – the Tamari move,
            not a single peak flip), or slide a <b>parenthesis</b>. Every view
            animates the same move. Colors follow identity: pastel fills are
            tree nodes (= triangles = humps); saturated strokes are tree edges
            (= diagonals = paren pairs). Below, the Tamari lattice: drag the
            ring along the colored edges to walk the flip graph (left comb at
            the bottom, right comb at the top).
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
        </ConfigPanel>
      </DemoWithConfig>
    );
  },
  {
    tags: [
      "d.between",
      "d.closest",
      "spec.withFloating [ghost]",
      "spec.withChaining",
      "math",
      "fancy",
    ],
  },
);
