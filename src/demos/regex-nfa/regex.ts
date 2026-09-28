// Regex ASTs, Thompson-construction NFAs (with a left-to-right layout),
// NFA simulation, and subset construction. Pure data, no rendering.

import dagre from "dagre";

// # AST

export type NodeKind = "char" | "concat" | "alt" | "star";

export type Node = {
  id: string;
  kind: NodeKind;
  char?: string;
  children: Node[];
};

let idCounter = 0;
export function freshId(prefix = "g"): string {
  idCounter++;
  return `${prefix}-${idCounter}`;
}

export function chr(id: string, char: string): Node {
  return { id, kind: "char", char, children: [] };
}
export function cat(id: string, ...children: Node[]): Node {
  return { id, kind: "concat", children };
}
export function alt(id: string, ...children: Node[]): Node {
  return { id, kind: "alt", children };
}
export function star(id: string, child: Node): Node {
  return { id, kind: "star", children: [child] };
}

export function regexToString(node: Node | null, parent?: NodeKind): string {
  if (!node) return "ε";
  switch (node.kind) {
    case "char":
      return node.char!;
    case "concat": {
      const s = node.children.map((c) => regexToString(c, "concat")).join("");
      return parent === "star" ? `(${s})` : s;
    }
    case "alt": {
      const s = node.children.map((c) => regexToString(c, "alt")).join("|");
      return parent === "concat" || parent === "star" ? `(${s})` : s;
    }
    case "star":
      return regexToString(node.children[0], "star") + "*";
  }
}

export function allNodes(node: Node | null): Node[] {
  if (!node) return [];
  return [node, ...node.children.flatMap(allNodes)];
}

export function subtreeIds(node: Node | null): Set<string> {
  return new Set(allNodes(node).map((n) => n.id));
}

export function findNode(root: Node | null, id: string): Node | undefined {
  return allNodes(root).find((n) => n.id === id);
}

export function findParent(
  root: Node | null,
  id: string,
): { parent: Node; index: number } | undefined {
  for (const n of allNodes(root)) {
    const index = n.children.findIndex((c) => c.id === id);
    if (index >= 0) return { parent: n, index };
  }
  return undefined;
}

export function replaceNode(
  root: Node | null,
  id: string,
  f: (old: Node) => Node,
): Node | null {
  if (!root) return null;
  if (root.id === id) return f(root);
  return {
    ...root,
    children: root.children.map((c) => replaceNode(c, id, f)!),
  };
}

/** Remove a node, collapsing containers left with a single child (and
 * removing containers left with none). */
export function removeNode(root: Node | null, id: string): Node | null {
  if (!root) return null;
  if (root.id === id) return null;
  const kids = root.children
    .map((c) => removeNode(c, id))
    .filter((c): c is Node => c !== null);
  if (root.kind === "star")
    return kids.length === 0 ? null : { ...root, children: kids };
  if (root.kind === "concat" || root.kind === "alt") {
    if (kids.length === 0) return null;
    if (kids.length === 1) return kids[0];
  }
  return { ...root, children: kids };
}

function insertChild(node: Node, index: number, child: Node): Node {
  const children = [...node.children];
  children.splice(index, 0, child);
  return { ...node, children };
}

/**
 * All the ways `node` could be placed into `root`: into any slot of any
 * container, or as a new sibling of any node (making a new concat/alt
 * container around it). Each result is a new root. `containerIds`
 * supplies stable ids for the new containers that might be created, so
 * that repeated calls within one drag agree.
 */
export function placementTargets(
  root: Node | null,
  node: Node,
  containerIds: { concat: string; alt: string },
): Node[] {
  if (!root) return [node];
  const targets: Node[] = [];
  for (const x of allNodes(root)) {
    const parentInfo = findParent(root, x.id);
    const parentKind = parentInfo?.parent.kind;
    if (x.kind === "concat" || x.kind === "alt") {
      for (let i = 0; i <= x.children.length; i++) {
        targets.push(
          replaceNode(root, x.id, (old) => insertChild(old, i, node))!,
        );
      }
    }
    if (parentKind !== "concat") {
      targets.push(
        replaceNode(root, x.id, (old) => cat(containerIds.concat, old, node))!,
      );
      targets.push(
        replaceNode(root, x.id, (old) => cat(containerIds.concat, node, old))!,
      );
    }
    if (parentKind !== "alt") {
      targets.push(
        replaceNode(root, x.id, (old) => alt(containerIds.alt, old, node))!,
      );
      targets.push(
        replaceNode(root, x.id, (old) => alt(containerIds.alt, node, old))!,
      );
    }
  }
  return targets;
}

/** Nodes that can be wrapped in a star (not already starred). */
export function starrableNodes(root: Node | null): Node[] {
  if (!root) return [];
  return allNodes(root).filter((x) => {
    if (x.kind === "star") return false;
    const p = findParent(root, x.id);
    return p?.parent.kind !== "star";
  });
}

export function wrapInStar(
  root: Node | null,
  id: string,
  starId: string,
): Node | null {
  return replaceNode(root, id, (old) => star(starId, old));
}

export function unwrapStar(root: Node | null, starId: string): Node | null {
  return replaceNode(root, starId, (old) => old.children[0]);
}

// # Thompson NFA, laid out left to right

export const NFA_R = 10; // state radius
const CHAR_W = 64;
const CONCAT_GAP = 40;
const ALT_PAD = 54;
const ALT_VGAP = 16;
const STAR_PAD = 46;
const LOOP_H = 24;

export type NfaState = { id: string; x: number; y: number; owner: string };
export type NfaEdge = {
  id: string;
  from: string;
  to: string;
  label: string | null; // null = ε
  owner: string;
  kind: "straight" | "curve" | "loop";
  bulge?: number; // for loops: absolute y of the control points
};

export type Frag = {
  w: number;
  above: number;
  below: number;
  inId: string;
  outId: string;
  states: NfaState[];
  edges: NfaEdge[];
};

export type Nfa = Frag & { start: string; accept: string };

function shift(frag: Frag, dx: number, dy: number): Frag {
  return {
    ...frag,
    states: frag.states.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy })),
    edges: frag.edges.map((e) =>
      e.bulge !== undefined ? { ...e, bulge: e.bulge + dy } : e,
    ),
  };
}

function edge(
  owner: string,
  from: string,
  to: string,
  label: string | null,
  kind: NfaEdge["kind"],
  bulge?: number,
): NfaEdge {
  return { id: `e-${from}-${to}`, from, to, label, owner, kind, bulge };
}

function layoutFrag(node: Node): Frag {
  const inId = `s-${node.id}-in`;
  const outId = `s-${node.id}-out`;
  switch (node.kind) {
    case "char": {
      return {
        w: CHAR_W,
        above: NFA_R,
        below: NFA_R,
        inId,
        outId,
        states: [
          { id: inId, x: 0, y: 0, owner: node.id },
          { id: outId, x: CHAR_W, y: 0, owner: node.id },
        ],
        edges: [edge(node.id, inId, outId, node.char!, "straight")],
      };
    }
    case "concat": {
      const kids = node.children.map(layoutFrag);
      const states: NfaState[] = [];
      const edges: NfaEdge[] = [];
      let x = 0;
      kids.forEach((k, i) => {
        const placed = shift(k, x, 0);
        states.push(...placed.states);
        edges.push(...placed.edges);
        x += k.w;
        if (i < kids.length - 1) {
          edges.push(
            edge(node.id, k.outId, kids[i + 1].inId, null, "straight"),
          );
          x += CONCAT_GAP;
        }
      });
      return {
        w: x,
        above: Math.max(...kids.map((k) => k.above)),
        below: Math.max(...kids.map((k) => k.below)),
        inId: kids[0].inId,
        outId: kids[kids.length - 1].outId,
        states,
        edges,
      };
    }
    case "alt": {
      const kids = node.children.map(layoutFrag);
      const maxW = Math.max(...kids.map((k) => k.w));
      const totalH =
        kids.reduce((acc, k) => acc + k.above + k.below, 0) +
        ALT_VGAP * (kids.length - 1);
      const w = 2 * ALT_PAD + maxW;
      const states: NfaState[] = [
        { id: inId, x: 0, y: 0, owner: node.id },
        { id: outId, x: w, y: 0, owner: node.id },
      ];
      const edges: NfaEdge[] = [];
      let y = -totalH / 2;
      for (const k of kids) {
        const cy = y + k.above;
        const placed = shift(k, ALT_PAD + (maxW - k.w) / 2, cy);
        states.push(...placed.states);
        edges.push(...placed.edges);
        edges.push(edge(node.id, inId, k.inId, null, "curve"));
        edges.push(edge(node.id, k.outId, outId, null, "curve"));
        y += k.above + k.below + ALT_VGAP;
      }
      return {
        w,
        above: Math.max(totalH / 2, NFA_R),
        below: Math.max(totalH / 2, NFA_R),
        inId,
        outId,
        states,
        edges,
      };
    }
    case "star": {
      const k = layoutFrag(node.children[0]);
      const w = 2 * STAR_PAD + k.w;
      const placed = shift(k, STAR_PAD, 0);
      const topY = -(k.above + LOOP_H);
      const bottomY = k.below + LOOP_H;
      return {
        w,
        above: k.above + LOOP_H + 6,
        below: k.below + LOOP_H + 6,
        inId,
        outId,
        states: [
          { id: inId, x: 0, y: 0, owner: node.id },
          { id: outId, x: w, y: 0, owner: node.id },
          ...placed.states,
        ],
        edges: [
          ...placed.edges,
          edge(node.id, inId, k.inId, null, "straight"),
          edge(node.id, k.outId, outId, null, "straight"),
          edge(node.id, k.outId, k.inId, null, "loop", topY),
          edge(node.id, inId, outId, null, "loop", bottomY),
        ],
      };
    }
  }
}

export function buildNfa(root: Node | null): Nfa {
  if (!root) {
    return {
      w: 0,
      above: NFA_R,
      below: NFA_R,
      inId: "s-empty",
      outId: "s-empty",
      start: "s-empty",
      accept: "s-empty",
      states: [{ id: "s-empty", x: 0, y: 0, owner: "" }],
      edges: [],
    };
  }
  const frag = layoutFrag(root);
  return { ...frag, start: frag.inId, accept: frag.outId };
}

// # Simulation

export function epsilonClosure(nfa: Nfa, states: Set<string>): Set<string> {
  const result = new Set(states);
  const stack = [...states];
  while (stack.length > 0) {
    const s = stack.pop()!;
    for (const e of nfa.edges) {
      if (e.from === s && e.label === null && !result.has(e.to)) {
        result.add(e.to);
        stack.push(e.to);
      }
    }
  }
  return result;
}

export function step(nfa: Nfa, states: Set<string>, char: string): Set<string> {
  const next = new Set<string>();
  for (const e of nfa.edges) {
    if (e.label === char && states.has(e.from)) next.add(e.to);
  }
  return epsilonClosure(nfa, next);
}

export function nfaMatches(nfa: Nfa, input: string): boolean {
  let current = epsilonClosure(nfa, new Set([nfa.start]));
  for (const c of input) {
    current = step(nfa, current, c);
    if (current.size === 0) return false;
  }
  return current.has(nfa.accept);
}

export function allStrings(alphabet: string[], maxLen: number): string[][] {
  const byLength: string[][] = [[""]];
  for (let len = 1; len <= maxLen; len++) {
    byLength.push(byLength[len - 1].flatMap((s) => alphabet.map((c) => s + c)));
  }
  return byLength;
}

// # Subset construction (DFA), laid out with dagre

export type DfaState = {
  id: string;
  nfaStates: string[];
  accept: boolean;
  x: number;
  y: number;
};
export type DfaEdge = {
  id: string;
  from: string;
  to: string;
  labels: string[];
};
export type Dfa = {
  start: string;
  states: DfaState[];
  edges: DfaEdge[];
  w: number;
  h: number;
};

export const DFA_R = 11;

function setId(states: Set<string>): string {
  // Strip the "s-" prefix and "-in"/"-out" suffixes into a compact id.
  return (
    "dfa-" +
    [...states]
      .sort()
      .map((s) =>
        s.replace(/^s-/, "").replace(/-in$/, "i").replace(/-out$/, "o"),
      )
      .join("_")
  );
}

export function buildDfa(nfa: Nfa, alphabet: string[]): Dfa {
  const startSet = epsilonClosure(nfa, new Set([nfa.start]));
  const startId = setId(startSet);
  const states = new Map<string, Set<string>>([[startId, startSet]]);
  const edgeMap = new Map<string, DfaEdge>();
  const queue = [startId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const set = states.get(id)!;
    for (const c of alphabet) {
      const next = step(nfa, set, c);
      if (next.size === 0) continue; // omit the dead state
      const nextId = setId(next);
      if (!states.has(nextId)) {
        states.set(nextId, next);
        queue.push(nextId);
      }
      const ek = `${id}>${nextId}`;
      const existing = edgeMap.get(ek);
      if (existing) existing.labels.push(c);
      else
        edgeMap.set(ek, {
          id: `de-${id}-${nextId}`,
          from: id,
          to: nextId,
          labels: [c],
        });
    }
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    nodesep: 44,
    ranksep: 72,
    marginx: 0,
    marginy: 0,
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const id of states.keys()) {
    g.setNode(id, { width: DFA_R * 2, height: DFA_R * 2 });
  }
  for (const e of edgeMap.values()) {
    if (e.from !== e.to) g.setEdge(e.from, e.to);
  }
  dagre.layout(g);
  const graphInfo = g.graph();

  return {
    start: startId,
    states: [...states.entries()].map(([id, set]) => {
      const n = g.node(id);
      return {
        id,
        nfaStates: [...set],
        accept: set.has(nfa.accept),
        x: n.x,
        y: n.y,
      };
    }),
    edges: [...edgeMap.values()],
    w: graphInfo.width ?? 0,
    h: graphInfo.height ?? 0,
  };
}
