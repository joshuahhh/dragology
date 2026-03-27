import dagre from "dagre";

export const tree1 = addParents({
  id: "root",
  children: [],
});
export const tree2 = addParents({
  id: "root",
  children: [{ id: "a", children: [] }],
});
export const tree3 = addParents({
  id: "root",
  children: [
    { id: "a", children: [] },
    { id: "b", children: [] },
  ],
});
export const tree4 = addParents({
  id: "root",
  children: [
    { id: "a", children: [{ id: "a1", children: [] }] },
    { id: "b", children: [] },
  ],
});
export const tree7 = addParents({
  id: "root",
  children: [
    {
      id: "a",
      children: [
        { id: "a1", children: [] },
        { id: "a2", children: [] },
      ],
    },
    {
      id: "b",
      children: [
        { id: "b1", children: [] },
        { id: "b2", children: [] },
      ],
    },
  ],
});
export const linearTree = addParents({
  id: "root",
  children: [
    {
      id: "a",
      children: [
        {
          id: "b",
          children: [],
        },
      ],
    },
  ],
});

export type TreeNodeWithoutParents = {
  id: string;
  children: TreeNodeWithoutParents[];
};

export type TreeNode = {
  id: string;
  parentId: string | null;
  parent: TreeNode | null;
  children: TreeNode[];
};

export function addParents(
  node: TreeNodeWithoutParents,
  parentId: string | null = null,
  parent: TreeNode | null = null,
): TreeNode {
  const n: TreeNode = {
    id: node.id,
    parentId,
    parent,
  } as TreeNode;
  n.children = node.children.map((child) => addParents(child, node.id, n));
  return n;
}

export type TreeMorph = Record<string, string>;

export function nodesInTree(root: TreeNode): TreeNode[] {
  const nodes: TreeNode[] = [];
  function visit(node: TreeNode) {
    nodes.push(node);
    for (const child of node.children) {
      visit(child);
    }
  }
  visit(root);
  return nodes;
}

// given a tree, return a map from node ID to node
const nodeByIdByRoot = new WeakMap<TreeNode, Map<string, TreeNode>>();
export function getNodesById(tree: TreeNode): Map<string, TreeNode> {
  if (nodeByIdByRoot.has(tree)) {
    return nodeByIdByRoot.get(tree)!;
  }
  const codomainNodes = nodesInTree(tree);
  const map = new Map(codomainNodes.map((n) => [n.id, n]));
  nodeByIdByRoot.set(tree, map);
  return map;
}
export function getNodeById(tree: TreeNode, id: string) {
  const map = getNodesById(tree);
  return map.get(id);
}

// /**
//  * We're descending the codomain tree, drawing bits of the domain
//  * tree in the right places. By the time we get to a codomain node,
//  * we have a bunch of domain nodes that need to be drawn somewhere.
//  */
// export function whatToDrawAtCodomainNode(
//   morph: TreeMorph,
//   domainNodes: TreeNode[],
//   codomainTree: TreeNode,
// ): {
//   domainNodesHere: TreeNode[];
//   domainNodesBelow: TreeNode[];
// } {
//   const domainNodesHere: TreeNode[] = [];
//   const domainNodesBelow: TreeNode[] = [];

// }

// # Example data

// Domain tree (parent with two children)
export const testDomainTree = addParents({
  id: "d0",
  children: [
    { id: "d1", children: [] },
    { id: "d2", children: [] },
  ],
});

// Codomain tree (3 layers)
export const testCodomainTree = addParents({
  id: "root",
  children: [
    {
      id: "a",
      children: [
        { id: "a1", children: [] },
        { id: "a2", children: [] },
      ],
    },
    {
      id: "b",
      children: [
        {
          id: "b1",
          children: [],
        },
        { id: "b2", children: [] },
        { id: "b3", children: [] },
      ],
    },
    { id: "c", children: [{ id: "c1", children: [] }] },
  ],
});

export const testMorphs: TreeMorph[] = [
  // Entire domain maps to one codomain node
  { d0: "root", d1: "root", d2: "root" },
  // Domain spread across multiple codomain nodes
  { d0: "root", d1: "a", d2: "b" },
  // Domain spanning parent and leaf
  { d0: "root", d1: "a1", d2: "a1" },
  // Starting lower
  { d0: "a", d1: "a1", d2: "a1" },
];

/**
 * Find all morphisms from domain tree to codomain tree.
 * A morphism is a map that preserves the ancestor-descendant partial order:
 * if x is an ancestor of y in domain, then f(x) must be an ancestor of f(y) in codomain.
 */
export function getAllMorphs(
  domain: TreeNode,
  codomain: TreeNode,
): TreeMorph[] {
  const results: TreeMorph[] = [];

  // Memoization cache: key is "domainId->codomainId"
  const memo = new Map<string, TreeMorph[]>();

  // Recursively find all morphisms from a domain subtree into a codomain subtree
  function findMorphsForSubtree(
    domainNode: TreeNode,
    codomainNode: TreeNode,
  ): TreeMorph[] {
    const key = `${domainNode.id}->${codomainNode.id}`;

    // Check cache first
    if (memo.has(key)) {
      return memo.get(key)!;
    }

    // Base case: map this domain node to this codomain node
    const morphsHere: TreeMorph[] = [{ [domainNode.id]: codomainNode.id }];

    if (domainNode.children.length === 0) {
      // Domain node is a leaf, we're done with this subtree
      memo.set(key, morphsHere);
      return morphsHere;
    }

    // We need to map each domain child to some node in the codomain subtree
    // (either codomainNode itself or one of its descendants)
    const codomainSubtreeNodes = nodesInTree(codomainNode);

    // For each domain child, find all valid mappings into the codomain subtree
    const childMorphOptions: TreeMorph[][] = domainNode.children.map(
      (domainChild) => {
        const morphsForThisChild: TreeMorph[] = [];
        // Try mapping this domain child to each node in the codomain subtree
        for (const codomainTarget of codomainSubtreeNodes) {
          const morphs = findMorphsForSubtree(domainChild, codomainTarget);
          morphsForThisChild.push(...morphs);
        }
        return morphsForThisChild;
      },
    );

    // Now combine: take the cartesian product of all child morphism options
    const combinedChildMorphs = cartesianProduct(childMorphOptions);

    // Merge each combination with the current node's mapping
    const result: TreeMorph[] = [];
    for (const childMorphList of combinedChildMorphs) {
      const merged: TreeMorph = { [domainNode.id]: codomainNode.id };
      for (const childMorph of childMorphList) {
        Object.assign(merged, childMorph);
      }
      result.push(merged);
    }

    memo.set(key, result);
    return result;
  }

  // Start by trying to map the domain root to each node in the codomain tree
  const codomainNodes = nodesInTree(codomain);
  for (const codomainNode of codomainNodes) {
    const morphs = findMorphsForSubtree(domain, codomainNode);
    results.push(...morphs);
  }

  return results;
}

/**
 * Compute the cartesian product of an array of arrays.
 * cartesianProduct([[1,2], [3,4]]) => [[1,3], [1,4], [2,3], [2,4]]
 */
function cartesianProduct<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [[]];
  if (arrays.length === 1) return arrays[0].map((x) => [x]);

  const [first, ...rest] = arrays;
  const restProduct = cartesianProduct(rest);

  const result: T[][] = [];
  for (const item of first) {
    for (const restItems of restProduct) {
      result.push([item, ...restItems]);
    }
  }
  return result;
}

/**
 * Build a function that checks if node1 is an ancestor of node2 (or equal to node2)
 */
export function buildAncestorMap(
  root: TreeNode,
): (ancestor: TreeNode, descendant: TreeNode) => boolean {
  const ancestorMap = new Map<string, Set<string>>();

  function visit(node: TreeNode, ancestors: string[]) {
    // A node is its own ancestor (reflexive)
    const nodeAncestors = new Set([...ancestors, node.id]);
    ancestorMap.set(node.id, nodeAncestors);

    for (const child of node.children) {
      visit(child, [...ancestors, node.id]);
    }
  }

  visit(root, []);

  return (ancestor: TreeNode, descendant: TreeNode) => {
    const ancestors = ancestorMap.get(descendant.id);
    return ancestors ? ancestors.has(ancestor.id) : false;
  };
}

/**
 * Check if morphism f covers morphism g.
 * f covers g if:
 * - They differ at exactly one domain node
 * - At that node, f maps to the parent of where g maps
 */
export function covers(
  f: TreeMorph,
  g: TreeMorph,
  codomain: TreeNode,
): string | null {
  const codomainNodes = nodesInTree(codomain);
  const nodeById = new Map(codomainNodes.map((n) => [n.id, n]));

  // Find all differences
  const differences: string[] = [];
  for (const key of Object.keys(f)) {
    if (f[key] !== g[key]) {
      differences.push(key);
    }
  }

  // Must differ at exactly one node
  if (differences.length !== 1) {
    return null;
  }

  const differingKey = differences[0];
  const fTarget = nodeById.get(f[differingKey]);
  const gTarget = nodeById.get(g[differingKey]);

  if (!fTarget || !gTarget) {
    return null;
  }

  if (fTarget.id !== gTarget.parentId) {
    return null;
  }

  return differingKey;
}

export type HasseDiagram = {
  nodes: TreeMorph[];
  edges: [number, number, string][]; // [from, to] where indices refer to nodes array
};

/**
 * Build a Hasse diagram of morphisms under the covering relation.
 * Returns nodes (morphisms) and edges (covering relations).
 */
export function buildHasseDiagram(
  domain: TreeNode,
  codomain: TreeNode,
): HasseDiagram {
  const morphs = getAllMorphs(domain, codomain);
  const edges: [number, number, string][] = [];

  // Build a map from morphism to its index for fast lookup
  const morphToIndex = new Map<string, number>();
  for (let i = 0; i < morphs.length; i++) {
    const key = JSON.stringify(morphs[i]);
    morphToIndex.set(key, i);
  }

  // Build a map of codomain nodes to their parents and children
  const codomainNodes = nodesInTree(codomain);
  const nodeById = new Map(codomainNodes.map((n) => [n.id, n]));

  // Track edges we've already found to avoid duplicates
  const edgeSet = new Set<string>();

  // For each morphism, generate its covering neighbors
  for (let i = 0; i < morphs.length; i++) {
    const morph = morphs[i];

    // For each domain node in the morphism
    for (const domainId of Object.keys(morph)) {
      const codomainId = morph[domainId];
      const codomainNode = nodeById.get(codomainId);
      if (!codomainNode) continue;

      // Try moving this domain node DOWN to each child (creates morphs that this one covers)
      for (const child of codomainNode.children) {
        const downMorph = { ...morph, [domainId]: child.id };
        const downMorphKey = JSON.stringify(downMorph);
        const downIndex = morphToIndex.get(downMorphKey);
        if (downIndex !== undefined) {
          const edgeKey = `${i},${downIndex},${domainId}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            edges.push([i, downIndex, domainId]); // morph covers downMorph
          }
        }
      }
    }
  }

  return { nodes: morphs, edges };
}

export type HasseLayout = {
  /** Map from morphism index to its (x, y) position */
  positions: Map<number, { x: number; y: number }>;
  /** Width and height of the entire layout */
  width: number;
  height: number;
};

/**
 * Compute a layered layout for a Hasse diagram using dagre.
 * Returns absolute (x, y) positions for each morphism.
 */
export function layoutHasse(diagram: HasseDiagram): HasseLayout {
  const g = new dagre.graphlib.Graph();

  // Configure graph layout
  g.setGraph({
    rankdir: "TB", // Top to bottom (maximal morphisms at top)
    nodesep: 100, // Horizontal separation between nodes
    ranksep: 150, // Vertical separation between ranks
  });

  // Default to set node labels
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes
  for (let i = 0; i < diagram.nodes.length; i++) {
    g.setNode(i.toString(), { width: 100, height: 100 });
  }

  // Add edges (from covers to, so from should be above to in BT layout)
  for (const [from, to] of diagram.edges) {
    g.setEdge(from.toString(), to.toString());
  }

  // Run layout
  dagre.layout(g);

  // Extract positions
  const positions = new Map<number, { x: number; y: number }>();
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  for (let i = 0; i < diagram.nodes.length; i++) {
    const node = g.node(i.toString());
    positions.set(i, { x: node.x, y: node.y });
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }

  return {
    positions,
    width: maxX - minX,
    height: maxY - minY,
  };
}
