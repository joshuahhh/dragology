// Shared immutable binary-search-tree utilities for the
// rotations-and-rebalancing panels. Nodes carry stable ids (derived
// from their keys, which are unique within a panel) so that the
// interpolation engine can track a node as rotations move it around.

export type Color = "red" | "black";

export type BstNode = {
  id: string;
  key: number;
  left: BstNode | null;
  right: BstNode | null;
  /** Only used by the red-black variant. */
  color?: Color;
};

export function leaf(key: number, color?: Color): BstNode {
  return { id: nodeId(key), key, left: null, right: null, color };
}

export function nodeId(key: number): string {
  return `node-${key}`;
}

// # Queries

export function find(root: BstNode | null, id: string): BstNode | null {
  if (!root) return null;
  if (root.id === id) return root;
  return find(root.left, id) ?? find(root.right, id);
}

/** Path from root down to the node with the given id (inclusive). */
export function pathTo(root: BstNode | null, id: string): BstNode[] | null {
  if (!root) return null;
  if (root.id === id) return [root];
  const l = pathTo(root.left, id);
  if (l) return [root, ...l];
  const r = pathTo(root.right, id);
  if (r) return [root, ...r];
  return null;
}

export function height(node: BstNode | null): number {
  if (!node) return 0;
  return 1 + Math.max(height(node.left), height(node.right));
}

export function size(node: BstNode | null): number {
  if (!node) return 0;
  return 1 + size(node.left) + size(node.right);
}

export function inOrder(node: BstNode | null): BstNode[] {
  if (!node) return [];
  return [...inOrder(node.left), node, ...inOrder(node.right)];
}

export function allNodes(node: BstNode | null): BstNode[] {
  return inOrder(node);
}

// # Rotations

/**
 * Rotate the child with id `childId` up over its parent. Returns the
 * new tree. This is a right rotation if the child is a left child and
 * a left rotation if it's a right child. If no node has a child with
 * that id, the tree is returned unchanged.
 */
export function rotateUp(root: BstNode, childId: string): BstNode {
  if (root.left?.id === childId) {
    const x = root.left;
    return { ...x, right: { ...root, left: x.right } };
  }
  if (root.right?.id === childId) {
    const x = root.right;
    return { ...x, left: { ...root, right: x.left } };
  }
  return {
    ...root,
    left: root.left && rotateUp(root.left, childId),
    right: root.right && rotateUp(root.right, childId),
  };
}

/** Right rotation at `node` (its left child becomes the new subtree root). */
export function rotateRight(node: BstNode): BstNode {
  const x = node.left!;
  return { ...x, right: { ...node, left: x.right } };
}

/** Left rotation at `node` (its right child becomes the new subtree root). */
export function rotateLeft(node: BstNode): BstNode {
  const x = node.right!;
  return { ...x, left: { ...node, right: x.left } };
}

// # Splay

export type SplayStep = "zig" | "zig-zig" | "zig-zag";

/**
 * Perform one splay step on the node with id `id`: zig if its parent is
 * the root, otherwise zig-zig or zig-zag depending on orientation.
 * Returns null if the node is already the root (or absent).
 */
export function splayStep(
  root: BstNode,
  id: string,
): { root: BstNode; step: SplayStep } | null {
  const path = pathTo(root, id);
  if (!path || path.length < 2) return null;
  const x = path[path.length - 1];
  const p = path[path.length - 2];
  if (path.length === 2) {
    return { root: rotateUp(root, x.id), step: "zig" };
  }
  const g = path[path.length - 3];
  const xLeft = p.left?.id === x.id;
  const pLeft = g.left?.id === p.id;
  if (xLeft === pLeft) {
    // zig-zig: rotate p over g, then x over p
    const r1 = rotateUp(root, p.id);
    return { root: rotateUp(r1, x.id), step: "zig-zig" };
  } else {
    // zig-zag: rotate x over p, then x over g
    const r1 = rotateUp(root, x.id);
    return { root: rotateUp(r1, x.id), step: "zig-zag" };
  }
}

// # Plain BST insertion

export function bstInsert(root: BstNode | null, key: number): BstNode {
  if (!root) return leaf(key);
  if (key < root.key) return { ...root, left: bstInsert(root.left, key) };
  if (key > root.key) return { ...root, right: bstInsert(root.right, key) };
  return root;
}

// # AVL insertion

export function balanceFactor(node: BstNode): number {
  return height(node.right) - height(node.left);
}

function avlRebalance(node: BstNode): BstNode {
  const bf = balanceFactor(node);
  if (bf < -1) {
    // left-heavy
    if (balanceFactor(node.left!) > 0) {
      // left-right case
      node = { ...node, left: rotateLeft(node.left!) };
    }
    return rotateRight(node);
  }
  if (bf > 1) {
    // right-heavy
    if (balanceFactor(node.right!) < 0) {
      // right-left case
      node = { ...node, right: rotateRight(node.right!) };
    }
    return rotateLeft(node);
  }
  return node;
}

export function avlInsert(root: BstNode | null, key: number): BstNode {
  if (!root) return leaf(key);
  if (key < root.key) {
    return avlRebalance({ ...root, left: avlInsert(root.left, key) });
  }
  if (key > root.key) {
    return avlRebalance({ ...root, right: avlInsert(root.right, key) });
  }
  return root;
}

// # Red-black insertion (Okasaki-style functional algorithm)

function isRed(node: BstNode | null): boolean {
  return node?.color === "red";
}

/**
 * Restore the red-black invariant at a black node whose child and
 * grandchild are both red. Produces a red node with two black children
 * — the same shape a CLRS-style fixup would produce via recoloring and
 * one or two rotations.
 */
function rbBalance(node: BstNode): BstNode {
  if (node.color !== "black") return node;
  const { left: l, right: r } = node;
  if (isRed(l) && isRed(l!.left)) {
    // left-left: rotate right, recolor
    const x = rotateRight(node);
    return {
      ...x,
      color: "red",
      left: { ...x.left!, color: "black" },
      right: { ...x.right!, color: "black" },
    };
  }
  if (isRed(l) && isRed(l!.right)) {
    // left-right: double rotation
    const x = rotateRight({ ...node, left: rotateLeft(l!) });
    return {
      ...x,
      color: "red",
      left: { ...x.left!, color: "black" },
      right: { ...x.right!, color: "black" },
    };
  }
  if (isRed(r) && isRed(r!.right)) {
    // right-right
    const x = rotateLeft(node);
    return {
      ...x,
      color: "red",
      left: { ...x.left!, color: "black" },
      right: { ...x.right!, color: "black" },
    };
  }
  if (isRed(r) && isRed(r!.left)) {
    // right-left
    const x = rotateLeft({ ...node, right: rotateRight(r!) });
    return {
      ...x,
      color: "red",
      left: { ...x.left!, color: "black" },
      right: { ...x.right!, color: "black" },
    };
  }
  return node;
}

function rbInsertInner(root: BstNode | null, key: number): BstNode {
  if (!root) return leaf(key, "red");
  if (key < root.key) {
    return rbBalance({ ...root, left: rbInsertInner(root.left, key) });
  }
  if (key > root.key) {
    return rbBalance({ ...root, right: rbInsertInner(root.right, key) });
  }
  return root;
}

export function rbInsert(root: BstNode | null, key: number): BstNode {
  return { ...rbInsertInner(root, key), color: "black" };
}

// # Layout

export type Pos = { x: number; y: number };

/**
 * Lay out a BST so that each node's x is determined by its key's rank
 * in `allKeys` (sorted ascending), and y by its depth. Because rotations
 * preserve in-order, nodes only move vertically during a rotation —
 * which makes the rotation easy to read.
 */
export function layoutByRank(
  root: BstNode | null,
  allKeys: number[],
  opts: { x0: number; y0: number; dx: number; dy: number },
): Map<string, Pos> {
  const sorted = [...allKeys].sort((a, b) => a - b);
  const rank = new Map(sorted.map((k, i) => [k, i]));
  const positions = new Map<string, Pos>();
  const walk = (node: BstNode | null, depth: number) => {
    if (!node) return;
    positions.set(node.id, {
      x: opts.x0 + rank.get(node.key)! * opts.dx,
      y: opts.y0 + depth * opts.dy,
    });
    walk(node.left, depth + 1);
    walk(node.right, depth + 1);
  };
  walk(root, 0);
  return positions;
}

/** Every (parent, child) pair in the tree. */
export function edges(root: BstNode | null): [BstNode, BstNode][] {
  if (!root) return [];
  const out: [BstNode, BstNode][] = [];
  for (const child of [root.left, root.right]) {
    if (child) {
      out.push([root, child]);
      out.push(...edges(child));
    }
  }
  return out;
}
