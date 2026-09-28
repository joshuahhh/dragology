import { DemoDraggable } from "../../demo/ui";
import { Draggable } from "../../draggable";
import {
  BstNode,
  SplayStep,
  bstInsert,
  edges,
  inOrder,
  layoutByRank,
  splayStep,
} from "./bst";
import { caption, edgeLine, keyCircle, svgButton } from "./render";

// # Splay tree
//
// Drag any non-root node toward the root. Each splay step (zig,
// zig-zig, or zig-zag) is a `d.between` from the current tree to the
// tree after that one step. With a chained snap radius, reaching the
// stepped tree immediately starts a new drag from there — so "drag to
// root" plays out as a visible sequence of rotations.

type State = {
  root: BstNode;
  lastStep: SplayStep | null;
  lastKey: number | null;
};

const INSERT_ORDER = [6, 3, 9, 1, 4, 8, 10, 2, 5, 7];

function buildInitial(): State {
  let root: BstNode | null = null;
  for (const k of INSERT_ORDER) root = bstInsert(root, k);
  return { root: root!, lastStep: null, lastKey: null };
}

const initialState: State = buildInitial();

export const WIDTH = 520;
export const HEIGHT = 320;
const DX = 44;
const DY = 50;
const X0 = 40;
const Y0 = 40;

export const splayDraggable: Draggable<State> = ({
  state,
  d,
  draggedId,
  setState,
}) => {
  const keys = inOrder(state.root).map((n) => n.key);
  const positions = layoutByRank(state.root, keys, {
    x0: X0,
    y0: Y0,
    dx: DX,
    dy: DY,
  });

  return (
    <g>
      {svgButton("splay-reset", { x: WIDTH - 60, y: 6 }, "reset", () =>
        setState(buildInitial(), { transition: 300 }),
      )}

      {edges(state.root).map(([p, c]) =>
        edgeLine(`edge-${c.id}`, positions.get(p.id)!, positions.get(c.id)!),
      )}

      {inOrder(state.root).map((node) => {
        const isRoot = node.id === state.root.id;
        return keyCircle({
          id: node.id,
          pos: positions.get(node.id)!,
          label: node.key,
          fill: isRoot ? "#fde68a" : "#dbeafe",
          stroke: isRoot ? "#d97706" : "#3b82f6",
          dragged: draggedId === node.id,
          extra: {
            dragologyOnDrag:
              !isRoot &&
              (() => {
                const next = splayStep(state.root, node.id)!;
                const stepped: State = {
                  root: next.root,
                  lastStep: next.step,
                  lastKey: node.key,
                };
                return d
                  .between([state, stepped])
                  .withSnapRadius(10, { chain: true });
              }),
          },
        });
      })}

      {caption(
        "splay-caption",
        { x: X0 - 15, y: HEIGHT - 12 },
        state.lastStep
          ? `last step: ${state.lastStep} on ${state.lastKey}`
          : "drag a node up toward the root",
      )}
    </g>
  );
};

export function SplayPanel() {
  return (
    <DemoDraggable
      draggable={splayDraggable}
      initialState={initialState}
      width={WIDTH}
      height={HEIGHT}
    />
  );
}
