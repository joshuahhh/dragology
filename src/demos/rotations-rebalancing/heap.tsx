import { DemoDraggable } from "../../demo/ui";
import { Draggable } from "../../draggable";
import { DragSpec } from "../../DragSpec";
import { translate } from "../../svgx/helpers";
import { Pos } from "./bst";
import { caption, edgeLines, keyCircle, svgButton } from "./render";

// # Binary max-heap
//
// The heap is an array; the tree view and the array view below it are
// two renderings of the same state, so every swap shows up in both.
//
// - Insert: drag a value from the deck onto the heap. It's appended at
//   the end (the next free slot).
// - Sift up: drag a node up past its parent. Each swap is a
//   `d.between` from the current array to the array with those two
//   entries exchanged, chained so you can keep going.
// - Sift down: drag a node down past its larger child.
// - Extract max: drag the root into the "out" tray; the last element
//   takes its place, ready to be sifted down.

type Item = { id: string; value: number };

type State = {
  heap: Item[];
  deck: Item[];
  out: Item[];
};

const DECK_VALUES = [14, 42, 7, 91, 23, 65];
const INITIAL_HEAP = [88, 50, 71, 33, 12, 60];

let counter = 0;
function item(value: number): Item {
  return { id: `h${counter++}-${value}`, value };
}

const initialState: State = {
  heap: INITIAL_HEAP.map(item),
  deck: DECK_VALUES.map(item),
  out: [],
};

export const WIDTH = 560;
export const HEIGHT = 340;
const CAPACITY = 15;
const TREE_Y0 = 100;
const LEVEL_H = 52;
const TREE_X0 = 20;
const TREE_W = 440;
const ARRAY_Y = 292;
const CELL_W = 28;
const ARRAY_X0 = 24;
const DECK_Y = 36;
const DECK_X0 = 76;
const DECK_DX = 38;
const OUT_X = 330;
const OUT_W = 168;

function treePos(i: number): Pos {
  const level = Math.floor(Math.log2(i + 1));
  const p = i - (2 ** level - 1);
  const n = 2 ** level;
  return {
    x: TREE_X0 + (TREE_W * (p + 0.5)) / n,
    y: TREE_Y0 + level * LEVEL_H,
  };
}

function swapped(state: State, i: number, j: number): State {
  const heap = [...state.heap];
  [heap[i], heap[j]] = [heap[j], heap[i]];
  return { ...state, heap };
}

export const heapDraggable: Draggable<State> = ({
  state,
  d,
  draggedId,
  setState,
}) => {
  const n = state.heap.length;

  /** The swap-with-neighbor moves available to the node at index i. */
  function swapSpecs(i: number): DragSpec<State>[] {
    const specs: DragSpec<State>[] = [];
    const me = state.heap[i].value;
    if (i > 0) {
      const parent = (i - 1) >> 1;
      if (me > state.heap[parent].value) {
        specs.push(d.between([state, swapped(state, i, parent)]));
      }
    }
    const l = 2 * i + 1;
    const r = 2 * i + 2;
    if (l < n) {
      const bigger = r < n && state.heap[r].value > state.heap[l].value ? r : l;
      if (state.heap[bigger].value > me) {
        specs.push(d.between([state, swapped(state, i, bigger)]));
      }
    }
    return specs;
  }

  return (
    <g>
      {svgButton("heap-reset", { x: WIDTH - 60, y: 6 }, "reset", () =>
        setState(initialState, { transition: 300 }),
      )}

      {/* Deck of values to insert */}
      <rect
        id="heap-deck-bg"
        transform={translate(DECK_X0 - 22, DECK_Y - 22)}
        width={DECK_VALUES.length * DECK_DX + 6}
        height={44}
        rx={8}
        fill="#f8fafc"
        stroke="#e2e8f0"
        dragologyZIndex={-2}
      />
      {caption("heap-deck-label", { x: 12, y: DECK_Y + 4 }, "insert →")}

      {state.deck.map((it, idx) =>
        keyCircle({
          id: `node-${it.id}`,
          pos: { x: DECK_X0 + idx * DECK_DX, y: DECK_Y },
          label: it.value,
          fill: "white",
          stroke: "#94a3b8",
          dragged: draggedId === `node-${it.id}`,
          extra: {
            dragologyOnDrag:
              n < CAPACITY &&
              (() => {
                const appended: State = {
                  ...state,
                  heap: [...state.heap, it],
                  deck: state.deck.filter((x) => x.id !== it.id),
                };
                return d
                  .dropTarget("heap-tree-area", appended)
                  .withFloating()
                  .whenFar(d.fixed(state).withFloating());
              }),
          },
        }),
      )}

      {/* Out tray for extracted maxima */}
      <g id="heap-out" transform={translate(OUT_X, DECK_Y - 22)}>
        <rect
          width={OUT_W}
          height={44}
          rx={8}
          fill="#fff7ed"
          stroke="#fdba74"
          strokeDasharray="4,3"
        />
        <text
          x={OUT_W - 6}
          y={22}
          textAnchor="end"
          dominantBaseline="central"
          fontSize={12}
          fill="#c2410c"
          fontStyle="italic"
        >
          ← extract max
        </text>
      </g>
      {state.out.map((it, idx) =>
        keyCircle({
          id: `node-${it.id}`,
          pos: { x: OUT_X + 20 + idx * 30, y: DECK_Y },
          label: it.value,
          fill: "#fed7aa",
          stroke: "#ea580c",
          dragged: draggedId === `node-${it.id}`,
        }),
      )}

      {/* Drop region for inserting from the deck */}
      <rect
        id="heap-tree-area"
        transform={translate(0, TREE_Y0 - 40)}
        width={WIDTH}
        height={ARRAY_Y - TREE_Y0 + 20}
        fill="transparent"
        dragologyZIndex={-3}
      />

      {/* Tree edges. Heap positions depend only on the index, so a
          swap changes which pair an edge joins but not its geometry;
          pair-keyed edges simply cross-fade in place. */}
      {edgeLines(
        "hedge",
        state.heap.slice(1).map((it, j) => [state.heap[j >> 1].id, it.id]),
        undefined,
        new Map(state.heap.map((it, i) => [it.id, treePos(i)])),
      )}

      {/* Tree nodes */}
      {state.heap.map((it, i) => {
        const id = `node-${it.id}`;
        return keyCircle({
          id,
          pos: treePos(i),
          label: it.value,
          fill: i === 0 ? "#fde68a" : "#dcfce7",
          stroke: i === 0 ? "#d97706" : "#16a34a",
          dragged: draggedId === id,
          extra: {
            dragologyOnDrag: () => {
              const swaps = swapSpecs(i).map((s) =>
                s.withSnapRadius(10, { chain: true }),
              );
              if (i === 0) {
                // The root can also be extracted into the out tray.
                const rest = state.heap.slice(1);
                const last = rest.pop();
                const extracted: State = {
                  ...state,
                  heap: last ? [last, ...rest] : [],
                  out: [...state.out, it],
                };
                return d
                  .closest([...swaps, d.dropTarget("heap-out", extracted)])
                  .whenFar(d.fixed(state).withFloating(), { gap: 40 });
              }
              if (swaps.length === 0) {
                // Nothing to do: heap property holds here. Let the node
                // wiggle but return home.
                return d
                  .fixed(state)
                  .withFloating({ tether: (dist) => dist / 4 });
              }
              return d.closest(swaps);
            },
          },
        });
      })}

      {/* Array view */}
      {Array.from({ length: CAPACITY }, (_, i) => (
        <g
          id={`slot-${i}`}
          transform={translate(ARRAY_X0 + i * CELL_W, ARRAY_Y)}
        >
          <rect
            x={-CELL_W / 2}
            y={-14}
            width={CELL_W}
            height={28}
            fill={i < n ? "white" : "#f8fafc"}
            stroke="#cbd5e1"
          />
          <text
            y={24}
            textAnchor="middle"
            fontSize={9}
            fill="#94a3b8"
            fontFamily="ui-monospace, monospace"
          >
            {i}
          </text>
        </g>
      ))}
      {state.heap.map((it, i) => (
        <text
          id={`cell-${it.id}`}
          transform={translate(ARRAY_X0 + i * CELL_W, ARRAY_Y)}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          fontWeight={draggedId === `node-${it.id}` ? 800 : 500}
          fill={draggedId === `node-${it.id}` ? "#d97706" : "#111"}
        >
          {it.value}
        </text>
      ))}
    </g>
  );
};

export function HeapPanel() {
  return (
    <DemoDraggable
      draggable={heapDraggable}
      initialState={initialState}
      width={WIDTH}
      height={HEIGHT}
    />
  );
}
