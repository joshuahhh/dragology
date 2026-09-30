import { DemoDraggable } from "../../demo/ui";
import { Draggable, OnDragCallback } from "../../draggable";
import { Svgx } from "../../svgx";
import { translate } from "../../svgx/helpers";
import { makeId } from "../../utils";
import { Pos } from "./bst";
import { caption, svgButton } from "./render";

// # 2-3 tree
//
// Every node holds one or two keys. Inserting into a full leaf (two
// keys) overflows it to three; the node splits, and the middle key is
// pushed up into the parent — which may itself overflow and split,
// and so on up to the root. Drag a key from the deck: the drop
// preview is the tree after all splits. Nodes created by a split use
// `dragologyEmergeFrom` to grow out of the node they split from.

type TTNode = {
  id: string;
  keys: number[];
  children: TTNode[]; // empty for leaves; keys.length + 1 otherwise
  emergeFrom?: string;
};

type State = {
  root: TTNode | null;
  deck: number[];
};

const ALL_KEYS = [50, 20, 80, 10, 30, 60, 90, 40, 70, 25, 55, 85];

export const initialState: State = { root: null, deck: ALL_KEYS };

// ## Insertion

type Split = { left: TTNode; mid: number; right: TTNode };

function isSplit(x: TTNode | Split): x is Split {
  return "mid" in x;
}

/** Split an overflowing node (3 keys, 0 or 4 children) into two. */
function splitNode(node: TTNode): Split {
  const [k0, k1, k2] = node.keys;
  const left: TTNode = {
    id: node.id,
    keys: [k0],
    children: node.children.slice(0, 2),
  };
  const right: TTNode = {
    id: makeId(),
    keys: [k2],
    children: node.children.slice(2, 4),
    emergeFrom: node.id,
  };
  return { left, mid: k1, right };
}

function insertInto(node: TTNode, key: number): TTNode | Split {
  // Which slot does the key belong in?
  let i = 0;
  while (i < node.keys.length && node.keys[i] < key) i++;

  if (node.children.length === 0) {
    const keys = [...node.keys.slice(0, i), key, ...node.keys.slice(i)];
    const grown = { ...node, keys };
    return keys.length <= 2 ? grown : splitNode(grown);
  }

  const result = insertInto(node.children[i], key);
  if (!isSplit(result)) {
    const children = [...node.children];
    children[i] = result;
    return { ...node, children };
  }
  const keys = [...node.keys.slice(0, i), result.mid, ...node.keys.slice(i)];
  const children = [
    ...node.children.slice(0, i),
    result.left,
    result.right,
    ...node.children.slice(i + 1),
  ];
  const grown = { ...node, keys, children };
  return keys.length <= 2 ? grown : splitNode(grown);
}

function insert(root: TTNode | null, key: number): TTNode {
  if (!root) return { id: makeId(), keys: [key], children: [] };
  const result = insertInto(root, key);
  if (!isSplit(result)) return result;
  return {
    id: makeId(),
    keys: [result.mid],
    children: [result.left, result.right],
    emergeFrom: root.id,
  };
}

// ## Layout

const KEY_W = 30;
const NODE_H = 30;
const LEVEL_H = 64;
const SIBLING_GAP = 14;

function nodeWidth(node: TTNode): number {
  return node.keys.length * KEY_W;
}

function subtreeWidth(node: TTNode): number {
  if (node.children.length === 0) return nodeWidth(node);
  const kids = node.children.reduce((s, c) => s + subtreeWidth(c), 0);
  return Math.max(
    nodeWidth(node),
    kids + SIBLING_GAP * (node.children.length - 1),
  );
}

/** Positions are node centers. */
function layout(node: TTNode, cx: number, y: number, into: Map<string, Pos>) {
  into.set(node.id, { x: cx, y });
  if (node.children.length === 0) return;
  const total = subtreeWidth(node);
  let x = cx - total / 2;
  for (const child of node.children) {
    const w = subtreeWidth(child);
    layout(child, x + w / 2, y + LEVEL_H, into);
    x += w + SIBLING_GAP;
  }
}

function allNodes(node: TTNode | null): TTNode[] {
  if (!node) return [];
  return [node, ...node.children.flatMap(allNodes)];
}

// ## Rendering

export const WIDTH = 520;
export const HEIGHT = 340;
const DECK_Y = 36;
const DECK_X0 = 80;
const DECK_DX = 34;
const TREE_Y0 = 110;

function keyCell(
  id: string,
  pos: Pos,
  key: number,
  dragged: boolean,
  onDrag?: OnDragCallback<State>,
): Svgx {
  return (
    <g
      id={id}
      transform={translate(pos.x, pos.y)}
      dragologyZIndex={dragged ? "/1" : false}
      dragologyOnDrag={onDrag}
    >
      <rect
        x={-KEY_W / 2}
        y={-NODE_H / 2}
        width={KEY_W}
        height={NODE_H}
        rx={4}
        fill={dragged ? "#fef3c7" : "white"}
        stroke={dragged ? "#f59e0b" : "#94a3b8"}
        strokeWidth={dragged ? 2.5 : 1.5}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight={600}
        fill="#111"
        pointerEvents="none"
      >
        {key}
      </text>
    </g>
  );
}

export const twoThreeDraggable: Draggable<State> = ({
  state,
  d,
  draggedId,
  setState,
}) => {
  const positions = new Map<string, Pos>();
  if (state.root) layout(state.root, WIDTH / 2, TREE_Y0, positions);

  return (
    <g>
      {svgButton("tt-reset", { x: WIDTH - 60, y: 6 }, "reset", () =>
        setState(initialState, { transition: 300 }),
      )}

      {/* Deck */}
      <rect
        id="tt-deck-bg"
        transform={translate(DECK_X0 - 22, DECK_Y - 22)}
        width={ALL_KEYS.length * DECK_DX + 10}
        height={44}
        rx={8}
        fill="#f8fafc"
        stroke="#e2e8f0"
        dragologyZIndex={-2}
      />
      {caption("tt-deck-label", { x: 12, y: DECK_Y + 4 }, "deck →")}

      {state.deck.map((key, i) =>
        keyCell(
          `key-${key}`,
          { x: DECK_X0 + i * DECK_DX, y: DECK_Y },
          key,
          draggedId === `key-${key}`,
          () => {
            const inserted: State = {
              root: insert(state.root, key),
              deck: state.deck.filter((k) => k !== key),
            };
            return d
              .dropTarget("tt-tree-area", inserted)
              .withFloating()
              .whenFar(d.fixed(state).withFloating());
          },
        ),
      )}

      {/* Drop region for deck keys */}
      <rect
        id="tt-tree-area"
        transform={translate(0, TREE_Y0 - 40)}
        width={WIDTH}
        height={HEIGHT - TREE_Y0 + 20}
        fill="transparent"
        dragologyZIndex={-3}
      />

      {/* Edges: parent bottom to child top */}
      {allNodes(state.root).flatMap((node) =>
        node.children.map((child) => {
          const p = positions.get(node.id)!;
          const c = positions.get(child.id)!;
          return (
            <line
              id={`tt-edge-${node.id}-${child.id}`}
              x1={p.x}
              y1={p.y + NODE_H / 2}
              x2={c.x}
              y2={c.y - NODE_H / 2}
              stroke="#94a3b8"
              strokeWidth={2}
              dragologyZIndex={-1}
              dragologyEmergeFrom={child.emergeFrom ?? node.emergeFrom}
            />
          );
        }),
      )}

      {/* Nodes: a container rect, with key cells laid over it */}
      {allNodes(state.root).map((node) => {
        const pos = positions.get(node.id)!;
        const w = nodeWidth(node);
        return (
          <g
            id={`tt-node-${node.id}`}
            transform={translate(pos.x, pos.y)}
            dragologyEmergeFrom={node.emergeFrom}
            dragologyEmergeMode="clone"
          >
            {/* Wrapped in a <g> so the emerge animation clones the
                whole node at the origin's position rather than trying
                to interpolate rect bounds. */}
            <g>
              <rect
                x={-w / 2 - 3}
                y={-NODE_H / 2 - 3}
                width={w + 6}
                height={NODE_H + 6}
                rx={7}
                fill="#e0e7ff"
                stroke="#6366f1"
                strokeWidth={1.5}
              />
            </g>
          </g>
        );
      })}

      {allNodes(state.root).flatMap((node) => {
        const pos = positions.get(node.id)!;
        const w = nodeWidth(node);
        return node.keys.map((key, i) =>
          keyCell(
            `key-${key}`,
            { x: pos.x - w / 2 + KEY_W / 2 + i * KEY_W, y: pos.y },
            key,
            false,
          ),
        );
      })}

      {caption(
        "tt-caption",
        { x: 12, y: HEIGHT - 12 },
        state.root
          ? "a node with 3 keys splits; its middle key is pushed up"
          : "drag a key from the deck into the tree",
      )}
    </g>
  );
};

export function TwoThreePanel() {
  return (
    <DemoDraggable
      draggable={twoThreeDraggable}
      initialState={initialState}
      width={WIDTH}
      height={HEIGHT}
    />
  );
}
