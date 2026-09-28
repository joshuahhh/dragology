import { produce } from "immer";
import _ from "lodash";
import { amb, produceAmb } from "../amb";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { inOrder, param } from "../DragSpec";
import { PathIn, getAtPath } from "../paths";
import { translate } from "../svgx/helpers";

// # A CSS-ish layout model
//
// A tree of nodes. Leaves have fixed sizes. Boxes lay their children
// out as a flex row, a flex column, or a grid with a fixed column
// count, with configurable gap and padding. A box hugs its content.
//
// The layout engine is just part of the render function, so any
// change to any node (moving, resizing, changing gap...) reflows the
// whole tree, and dragology interpolates the reflow for free.

type Leaf = { type: "leaf"; id: string; w: number; h: number; color: string };
type Box = {
  type: "box";
  id: string;
  direction: "row" | "column" | "grid";
  cols: number; // only used for "grid"
  gap: number;
  padding: number;
  children: Node[];
};
type Node = Leaf | Box;

type State = { root: Box };

type Path = (string | number)[];

const MIN_LEAF = 20;
const MAX_LEAF = 240;
const MIN_EMPTY_BOX = 44;
const MAX_GAP = 48;
const MAX_PADDING = 40;

const leafColors = {
  red: "#f87171",
  orange: "#fb923c",
  yellow: "#facc15",
  green: "#4ade80",
  blue: "#60a5fa",
  purple: "#a78bfa",
  pink: "#f472b6",
};

const initialState: State = {
  root: {
    type: "box",
    id: "root",
    direction: "column",
    cols: 2,
    gap: 12,
    padding: 12,
    children: [
      {
        type: "box",
        id: "header",
        direction: "row",
        cols: 2,
        gap: 8,
        padding: 8,
        children: [
          { type: "leaf", id: "logo", w: 36, h: 36, color: leafColors.red },
          { type: "leaf", id: "nav-a", w: 60, h: 24, color: leafColors.orange },
          { type: "leaf", id: "nav-b", w: 60, h: 24, color: leafColors.orange },
          { type: "leaf", id: "nav-c", w: 60, h: 24, color: leafColors.orange },
        ],
      },
      {
        type: "box",
        id: "body",
        direction: "row",
        cols: 2,
        gap: 12,
        padding: 8,
        children: [
          {
            type: "box",
            id: "sidebar",
            direction: "column",
            cols: 2,
            gap: 6,
            padding: 6,
            children: [
              {
                type: "leaf",
                id: "side-1",
                w: 56,
                h: 28,
                color: leafColors.green,
              },
              {
                type: "leaf",
                id: "side-2",
                w: 56,
                h: 28,
                color: leafColors.green,
              },
              {
                type: "leaf",
                id: "side-3",
                w: 56,
                h: 28,
                color: leafColors.green,
              },
            ],
          },
          {
            type: "box",
            id: "gallery",
            direction: "grid",
            cols: 2,
            gap: 8,
            padding: 8,
            children: [
              {
                type: "leaf",
                id: "img-1",
                w: 64,
                h: 48,
                color: leafColors.blue,
              },
              {
                type: "leaf",
                id: "img-2",
                w: 64,
                h: 48,
                color: leafColors.purple,
              },
              {
                type: "leaf",
                id: "img-3",
                w: 64,
                h: 48,
                color: leafColors.pink,
              },
              {
                type: "leaf",
                id: "img-4",
                w: 64,
                h: 48,
                color: leafColors.blue,
              },
            ],
          },
        ],
      },
    ],
  },
};

// # Layout engine

type Layout = {
  w: number;
  h: number;
  // For boxes: where each child goes (relative to the box's origin),
  // and the child layouts.
  slots: { x: number; y: number; layout: Layout }[];
  // Convenience: the gridded column widths / row heights (for grid),
  // used to place the "cols" handle.
  colWidths: number[];
  rowHeights: number[];
};

function layout(node: Node): Layout {
  if (node.type === "leaf") {
    return {
      w: node.w,
      h: node.h,
      slots: [],
      colWidths: [],
      rowHeights: [],
    };
  }
  const { gap, padding } = node;
  const kids = node.children.map(layout);
  const n = kids.length;

  let cols: number;
  if (node.direction === "row") cols = Math.max(n, 1);
  else if (node.direction === "column") cols = 1;
  else cols = Math.max(1, Math.min(node.cols, Math.max(n, 1)));
  const rows = Math.max(1, Math.ceil(n / cols));

  const colWidths = _.range(cols).map((c) =>
    Math.max(0, ...kids.filter((_k, i) => i % cols === c).map((k) => k.w)),
  );
  const rowHeights = _.range(rows).map((r) =>
    Math.max(
      0,
      ...kids.filter((_k, i) => Math.floor(i / cols) === r).map((k) => k.h),
    ),
  );
  const colXs = colWidths.reduce<number[]>(
    (acc, w, i) => [...acc, acc[i] + w + gap],
    [0],
  );
  const rowYs = rowHeights.reduce<number[]>(
    (acc, h, i) => [...acc, acc[i] + h + gap],
    [0],
  );

  const contentW = n === 0 ? 0 : colXs[cols] - gap;
  const contentH = n === 0 ? 0 : rowYs[rows] - gap;

  const w = Math.max(contentW + 2 * padding, MIN_EMPTY_BOX);
  const h = Math.max(contentH + 2 * padding, MIN_EMPTY_BOX);

  const slots = kids.map((k, i) => ({
    x: padding + colXs[i % cols],
    y: padding + rowYs[Math.floor(i / cols)],
    layout: k,
  }));

  return { w, h, slots, colWidths, rowHeights };
}

function getNode(state: State, path: Path): Node {
  return getAtPath(state, path as PathIn<State, Node>);
}

/** A `param` for a numeric field of the node at `path`. */
function numParam(path: Path, field: string) {
  return param<State>(...([...path, field] as PathIn<State, number>));
}

function getBox(state: State, path: Path): Box {
  const node = getNode(state, path);
  if (node.type !== "box") throw new Error("expected box at " + path);
  return node;
}

// # Rendering

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  const HANDLE = 10;

  function renderNode(node: Node, path: Path, lay: Layout): React.JSX.Element {
    const isRoot = path.length === 1;
    const isDragged = draggedId === node.id;
    const zIndex = isDragged && "/1";

    // ## Moving a node between / within containers
    const onDragMove = () => {
      const parentPath = path.slice(0, -1);
      const idx = path[path.length - 1] as number;

      const stateWithout = produce(state, (draft) => {
        const siblings = getAtPath<State, Node[]>(
          draft,
          parentPath as PathIn<State, Node[]>,
        );
        siblings.splice(idx, 1);
      });

      // Every box remaining in the tree (which excludes the dragged
      // node and its descendants), every insertion index.
      const statesSnapped = produceAmb(stateWithout, (draft) => {
        let box: Box = draft.root;
        while (true) {
          if (amb([true, false])) break;
          box = amb(box.children.filter((c) => c.type === "box"));
        }
        const insertIdx = amb(_.range(box.children.length + 1));
        box.children.splice(insertIdx, 0, node);
      });

      return d
        .closest(statesSnapped)
        .withFloating()
        .whenFar(state, { gap: 40 })
        .withBranchTransition(120);
    };

    if (node.type === "leaf") {
      const leafPath = path;
      return (
        <g
          id={node.id}
          dragologyZIndex={zIndex}
          dragologyOnDrag={onDragMove}
          style={{ cursor: "grab" }}
        >
          <rect
            width={lay.w}
            height={lay.h}
            rx={4}
            fill={node.color}
            stroke="rgba(0,0,0,0.25)"
            strokeWidth={1}
          />
          {/* Resize corner: vary w & h */}
          <g
            id={`${node.id}-resize`}
            transform={translate(lay.w - HANDLE, lay.h - HANDLE)}
            style={{ cursor: "nwse-resize" }}
            dragologyOnDrag={() =>
              d.vary(
                state,
                [numParam(leafPath, "w"), numParam(leafPath, "h")],
                {
                  constraint: (s) => {
                    const l = getNode(s, leafPath) as Leaf;
                    return inOrder([
                      [MIN_LEAF, l.w, MAX_LEAF],
                      [MIN_LEAF, l.h, MAX_LEAF],
                    ]);
                  },
                },
              )
            }
          >
            <rect width={HANDLE} height={HANDLE} fill="transparent" />
            <path
              d={`M ${HANDLE - 2} 2 L ${HANDLE - 2} ${HANDLE - 2} L 2 ${HANDLE - 2}`}
              fill="none"
              stroke="rgba(0,0,0,0.45)"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          </g>
        </g>
      );
    }

    // ## A box
    const box = node;
    const boxPath = path;
    const { w, h } = lay;
    const n = box.children.length;
    const isRow = box.direction === "row";
    const isColumn = box.direction === "column";
    const isGrid = box.direction === "grid";

    const withDirection = (direction: Box["direction"]) =>
      produce(state, (draft) => {
        getBox(draft, boxPath).direction = direction;
      });

    // Where the axis handle sits in each direction. Dragging it
    // between these positions switches the direction.
    const axisPos = {
      row: translate(w - HANDLE / 2, h / 2),
      column: translate(w / 2, h - HANDLE / 2),
      grid: translate(w - HANDLE / 2, h - HANDLE / 2),
    }[box.direction];

    // Gap handle: in the middle of the first gap along the main axis.
    let gapPos: string | null = null;
    if (n >= 2 && lay.slots.length >= 2) {
      const s0 = lay.slots[0];
      if (isColumn || (isGrid && lay.colWidths.length === 1)) {
        gapPos = translate(
          s0.x + s0.layout.w / 2,
          s0.y + lay.rowHeights[0] + box.gap / 2,
        );
      } else {
        gapPos = translate(
          s0.x + lay.colWidths[0] + box.gap / 2,
          s0.y + s0.layout.h / 2,
        );
      }
    }

    // Cols handle (grid only): at the right end of the first row.
    const usedCols = isGrid
      ? Math.max(1, Math.min(box.cols, Math.max(n, 1)))
      : 0;
    const colsPos =
      isGrid && n >= 2
        ? translate(
            box.padding + _.sum(lay.colWidths) + box.gap * (usedCols - 1) + 6,
            box.padding + lay.rowHeights[0] / 2,
          )
        : null;

    const tint = isRoot ? "#f8fafc" : "rgba(99, 102, 241, 0.08)";
    const stroke = isRoot ? "#cbd5e1" : "rgba(99, 102, 241, 0.5)";

    return (
      <g
        id={box.id}
        dragologyZIndex={zIndex}
        dragologyOnDrag={isRoot ? undefined : onDragMove}
        style={{ cursor: isRoot ? undefined : "grab" }}
      >
        <rect
          width={w}
          height={h}
          rx={6}
          fill={tint}
          stroke={stroke}
          strokeWidth={1.5}
          strokeDasharray={isRoot ? undefined : "4 3"}
        />

        {/* Children */}
        {box.children.map((child, i) => (
          <g
            id={`${box.id}-slot-${i}`}
            transform={translate(lay.slots[i].x, lay.slots[i].y)}
          >
            {renderNode(
              child,
              [...boxPath, "children", i],
              lay.slots[i].layout,
            )}
          </g>
        ))}

        {/* Padding handle: vary padding */}
        <g
          id={`${box.id}-pad`}
          dragologyZIndex={2}
          transform={translate(box.padding, box.padding)}
          style={{ cursor: "move" }}
          dragologyOnDrag={() =>
            d.vary(state, numParam(boxPath, "padding"), {
              constraint: (s) =>
                inOrder([0, getBox(s, boxPath).padding, MAX_PADDING]),
            })
          }
        >
          <rect
            transform={translate(-HANDLE / 2, -HANDLE / 2)}
            width={HANDLE}
            height={HANDLE}
            fill="transparent"
          />
          <path
            d={`M -4 1 L -4 -4 L 1 -4`}
            fill="none"
            stroke="#6366f1"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </g>

        {/* Gap handle: vary gap */}
        {gapPos && (
          <g
            id={`${box.id}-gap`}
            dragologyZIndex={2}
            transform={gapPos}
            style={{ cursor: isColumn ? "ns-resize" : "ew-resize" }}
            dragologyOnDrag={() =>
              d.vary(state, numParam(boxPath, "gap"), {
                constraint: (s) =>
                  inOrder([0, getBox(s, boxPath).gap, MAX_GAP]),
              })
            }
          >
            <rect
              transform={translate(-HANDLE / 2, -HANDLE / 2)}
              width={HANDLE}
              height={HANDLE}
              fill="transparent"
            />
            {isColumn ? (
              <path
                d="M -4 0 L 4 0"
                stroke="#6366f1"
                strokeWidth={2}
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M 0 -4 L 0 4"
                stroke="#6366f1"
                strokeWidth={2}
                strokeLinecap="round"
              />
            )}
          </g>
        )}

        {/* Cols handle (grid): closest over column counts */}
        {colsPos && (
          <g
            id={`${box.id}-cols`}
            dragologyZIndex={2}
            transform={colsPos}
            style={{ cursor: "ew-resize" }}
            dragologyOnDrag={() =>
              d
                .closest(
                  _.range(1, n + 1).map((c) =>
                    produce(state, (draft) => {
                      getBox(draft, boxPath).cols = c;
                    }),
                  ),
                )
                .withBranchTransition(120)
            }
          >
            <rect
              transform={translate(-HANDLE / 2, -HANDLE / 2)}
              width={HANDLE}
              height={HANDLE}
              fill="transparent"
            />
            <circle r={3.5} fill="white" stroke="#6366f1" strokeWidth={2} />
          </g>
        )}

        {/* Axis handle: between row / column / grid */}
        <g
          id={`${box.id}-axis`}
          dragologyZIndex={3}
          transform={axisPos}
          style={{ cursor: "pointer" }}
          dragologyOnDrag={() =>
            d
              .between([
                withDirection("row"),
                withDirection("column"),
                withDirection("grid"),
              ])
              .withDropTransition(150)
          }
        >
          <circle
            r={HANDLE / 2 + 2}
            fill="white"
            stroke="#6366f1"
            strokeWidth={1.5}
          />
          {isRow && (
            <path
              d="M -4 0 L 4 0 M 1.5 -2.5 L 4 0 L 1.5 2.5"
              fill="none"
              stroke="#6366f1"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          )}
          {isColumn && (
            <path
              d="M 0 -4 L 0 4 M -2.5 1.5 L 0 4 L 2.5 1.5"
              fill="none"
              stroke="#6366f1"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          )}
          {isGrid && (
            <path
              d="M -3.5 -3.5 h 3 v 3 h -3 z M 0.5 -3.5 h 3 v 3 h -3 z M -3.5 0.5 h 3 v 3 h -3 z M 0.5 0.5 h 3 v 3 h -3 z"
              fill="#6366f1"
            />
          )}
        </g>
      </g>
    );
  }

  return (
    <g transform={translate(20, 20)}>
      {renderNode(state.root, ["root"], layout(state.root))}
    </g>
  );
};

export default demo(
  () => (
    <div>
      <DemoNotes>
        A layout editor for a CSS-like flex/grid model. The layout engine is the
        render function, so every edit reflows the whole tree. Drag a colored
        leaf or a dashed box to move it between containers or reorder it. Drag a
        leaf's corner to resize it. Each box has handles: the circled arrow on
        its edge switches direction (right edge = row, bottom = column, corner =
        grid); the small tick in the first gap adjusts the gap; the corner
        bracket adjusts padding; grids have a dot after the first row to change
        the column count.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={560}
        height={480}
      />
    </div>
  ),
  {
    tags: [
      "d.closest",
      "d.between",
      "d.vary [constraint]",
      "spec.whenFar",
      "spec.withFloating",
      "reordering",
    ],
  },
);
