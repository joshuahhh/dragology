import { useMemo, useState } from "react";
import {
  ConfigPanel,
  ConfigRadio,
  DemoDraggable,
  DemoWithConfig,
} from "../../demo/ui";
import { Draggable } from "../../draggable";
import { translate } from "../../svgx/helpers";
import {
  BstNode,
  avlInsert,
  balanceFactor,
  edges,
  inOrder,
  layoutByRank,
  nodeId,
  rbInsert,
} from "./bst";
import { NODE_R, caption, edgeLine, keyCircle, svgButton } from "./render";

// # AVL / red-black insertion
//
// Keys wait in a deck. Drag one into the tree: the drop preview is the
// tree *after* insertion and rebalancing (rotations and recolorings
// included). There's no need to author the animation — it's the
// interpolation between the current tree and the algorithm's output.

type Mode = "avl" | "red-black";

type State = {
  root: BstNode | null;
  deck: number[];
};

const ALL_KEYS = [5, 2, 8, 1, 9, 3, 7, 4, 6, 10];

const initialState: State = { root: null, deck: ALL_KEYS };

export const WIDTH = 520;
export const HEIGHT = 340;
const DX = 44;
const DY = 52;
const X0 = 40;
const TREE_Y0 = 110;
const DECK_Y = 36;
const DECK_X0 = 90;
const DECK_DX = 40;

function insertFor(mode: Mode) {
  return mode === "avl" ? avlInsert : rbInsert;
}

function nodeStyle(mode: Mode, node: BstNode) {
  if (mode === "red-black") {
    const red = node.color === "red";
    return {
      fill: red ? "#ef4444" : "#1f2937",
      stroke: red ? "#b91c1c" : "#111827",
      textFill: "white",
    };
  }
  return { fill: "#dbeafe", stroke: "#3b82f6", textFill: "#111" };
}

export function balancedDraggable(mode: Mode): Draggable<State> {
  const insert = insertFor(mode);
  return ({ state, d, draggedId, setState }) => {
    const positions = layoutByRank(state.root, ALL_KEYS, {
      x0: X0,
      y0: TREE_Y0,
      dx: DX,
      dy: DY,
    });

    return (
      <g>
        {svgButton("balanced-reset", { x: WIDTH - 60, y: 6 }, "reset", () =>
          setState(initialState, { transition: 300 }),
        )}

        {/* Deck */}
        <rect
          id="deck-bg"
          transform={translate(DECK_X0 - 25, DECK_Y - 22)}
          width={ALL_KEYS.length * DECK_DX + 10}
          height={44}
          rx={8}
          fill="#f8fafc"
          stroke="#e2e8f0"
          dragologyZIndex={-2}
        />
        {caption("deck-label", { x: 12, y: DECK_Y + 4 }, "deck →")}

        {state.deck.map((key, i) => {
          const id = nodeId(key);
          return keyCircle({
            id,
            pos: { x: DECK_X0 + i * DECK_DX, y: DECK_Y },
            label: key,
            fill: "white",
            stroke: "#94a3b8",
            dragged: draggedId === id,
            extra: {
              dragologyOnDrag: () => {
                const inserted: State = {
                  root: insert(state.root, key),
                  deck: state.deck.filter((k) => k !== key),
                };
                return d
                  .dropTarget("tree-area", inserted)
                  .withFloating()
                  .whenFar(d.fixed(state).withFloating());
              },
            },
          });
        })}

        {/* Tree (the invisible rect is the drop region for deck keys) */}
        <rect
          id="tree-area"
          transform={translate(0, TREE_Y0 - 40)}
          width={WIDTH}
          height={HEIGHT - TREE_Y0 + 20}
          fill="transparent"
          dragologyZIndex={-3}
        />
        {edges(state.root).map(([p, c]) =>
          edgeLine(`edge-${c.id}`, positions.get(p.id)!, positions.get(c.id)!),
        )}

        {inOrder(state.root).map((node) =>
          keyCircle({
            id: node.id,
            pos: positions.get(node.id)!,
            label: node.key,
            ...nodeStyle(mode, node),
            dragged: draggedId === node.id,
          }),
        )}

        {mode === "avl" &&
          inOrder(state.root).map((node) => {
            const pos = positions.get(node.id)!;
            return (
              <text
                id={`bf-${node.id}`}
                transform={translate(pos.x + NODE_R + 2, pos.y - NODE_R + 2)}
                fontSize={9}
                fill="#64748b"
                fontFamily="ui-monospace, monospace"
              >
                {formatBf(balanceFactor(node))}
              </text>
            );
          })}

        {caption(
          "balanced-caption",
          { x: X0 - 15, y: HEIGHT - 12 },
          state.root
            ? mode === "avl"
              ? "small numbers are balance factors (right height − left height)"
              : "preview shows recolorings and rotations of the insert fixup"
            : "drag a key from the deck into the tree",
        )}
      </g>
    );
  };
}

function formatBf(bf: number): string {
  return bf > 0 ? `+${bf}` : `${bf}`;
}

export function BalancedPanel() {
  const [mode, setMode] = useState<Mode>("avl");
  const draggable = useMemo(() => balancedDraggable(mode), [mode]);
  return (
    <DemoWithConfig>
      <DemoDraggable
        key={mode}
        draggable={draggable}
        initialState={initialState}
        width={WIDTH}
        height={HEIGHT}
      />
      <ConfigPanel>
        <ConfigRadio
          label="Tree"
          value={mode}
          onChange={setMode}
          options={{ avl: "AVL", "red-black": "Red-black" }}
        />
      </ConfigPanel>
    </DemoWithConfig>
  );
}
