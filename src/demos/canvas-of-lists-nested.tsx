import { produce } from "immer";
import _ from "lodash";
import { SVGProps } from "react";
import { amb, produceAmb } from "../amb";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { getAtPath, PathIn } from "../paths";
import { translate } from "../svgx/helpers";

type State = {
  rows: (Row & { x: number; y: number })[];
};

type Tile = { type: "tile"; id: string; label: string };
type Row = { type: "row"; id: string; items: (Tile | Row)[]; color: string };

const colors = [
  "#c9e4f0", // soft blue
  "#f5d5d8", // soft pink
  "#d4edcf", // soft green
  "#f5eac9", // soft yellow
  "#e4d4e8", // soft purple
  "#f5dcc9", // soft peach
  "#c9f0ed", // soft aqua
  "#e8d4f0", // soft lavender
];

const initialState: State = {
  rows: [
    {
      type: "row",
      id: "row1",
      items: [
        { type: "tile", id: "A1", label: "A1" },
        { type: "tile", id: "B1", label: "B1" },
        {
          type: "row",
          id: "row1-1",
          items: [
            { type: "tile", id: "A1-1", label: "A1-1" },
            { type: "tile", id: "B1-1", label: "B1-1" },
          ],
          color: colors[3],
        },
      ],
      color: colors[0],
      x: 0,
      y: 0,
    },
    {
      type: "row",
      id: "row2",
      items: [
        { type: "tile", id: "A2", label: "A2" },
        { type: "tile", id: "B2", label: "B2" },
        { type: "tile", id: "C2", label: "C2" },
      ],
      color: colors[1],
      x: 20,
      y: 100,
    },
    {
      type: "row",
      id: "row3",
      items: [
        { type: "tile", id: "A3", label: "A3" },
        { type: "tile", id: "B3", label: "B3" },
        { type: "tile", id: "C3", label: "C3" },
      ],
      color: colors[2],
      x: 100,
      y: 200,
    },
  ],
};

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  const TILE_SIZE = 50;
  const TILE_GAP = 8;
  const ROW_PADDING = 8;
  const GRIP_WIDTH = 16;
  const GRIP_PADDING = 2;

  function getItemWidth(item: Tile | Row): number {
    if (item.type === "tile") {
      return TILE_SIZE;
    } else {
      return getRowWidth(item);
    }
  }

  function getRowWidth(row: Row): number {
    const itemsWidth = row.items.reduce(
      (acc, item) => acc + getItemWidth(item) + TILE_GAP,
      -TILE_GAP,
    );
    return GRIP_WIDTH + GRIP_PADDING + itemsWidth + ROW_PADDING * 2;
  }

  function getRowHeight(row: Row): number {
    const maxItemHeight = Math.max(
      TILE_SIZE,
      ...row.items.map((item) =>
        item.type === "tile" ? TILE_SIZE : getRowHeight(item),
      ),
    );
    return maxItemHeight + ROW_PADDING * 2;
  }

  function renderItem(
    item: Tile | Row,
    itemsPath: PathIn<State, (Tile | Row)[]>,
    idx: number,
    zIndexBase: number,
    attrs?: SVGProps<SVGGElement>,
  ) {
    const isDragged = draggedId === item.id;

    const onDrag = () => {
      // Remove item from current location
      const stateWithout = produce(state, (draft) => {
        const items = getAtPath<State, (Tile | Row)[]>(draft, itemsPath);
        items.splice(idx, 1);
      });

      // Generate states for all possible placements
      const statesWith = produceAmb(stateWithout, (draft) => {
        let row: Row = amb(draft.rows);
        while (true) {
          if (amb([true, false])) break;
          row = amb(row.items.filter((i) => i.type === "row"));
        }
        const insertIdx = amb(_.range(row.items.length + 1));
        row.items.splice(insertIdx, 0, item);
      });

      // Create backdrop state for floating mode
      const stateWithTopRow = produce(stateWithout, (draft) => {
        if (item.type === "tile") {
          const newRowId = "row-" + Math.random().toString(36).slice(2);
          const newRowColor = colors[stateWithout.rows.length % colors.length];
          draft.rows.push({
            type: "row",
            id: newRowId,
            items: [item],
            color: newRowColor,
            x: 0,
            y: 0,
          });
        } else {
          draft.rows.push({ ...item, x: 0, y: 0 });
        }
      });

      return d.closest(d.floating(statesWith)).withBackground(
        d.vary(stateWithTopRow, [
          ["rows", stateWithTopRow.rows.length - 1, "x"],
          ["rows", stateWithTopRow.rows.length - 1, "y"],
        ]),
      );
    };

    const effectiveZIndex = isDragged ? zIndexBase + 10 : zIndexBase;

    if (item.type === "tile") {
      return (
        <g
          id={item.id}
          data-z-index={effectiveZIndex}
          data-on-drag={onDrag}
          {...attrs}
        >
          <rect
            x={0}
            y={0}
            width={TILE_SIZE}
            height={TILE_SIZE}
            stroke="#aaa"
            strokeWidth={1.5}
            fill="white"
            rx={4}
          />
          <text
            x={TILE_SIZE / 2}
            y={TILE_SIZE / 2}
            dominantBaseline="middle"
            textAnchor="middle"
            fontSize={18}
            fontWeight="500"
            fill="#555"
          >
            {item.label}
          </text>
        </g>
      );
    } else {
      const rowHeight = getRowHeight(item);
      let xOffset = GRIP_WIDTH + GRIP_PADDING + ROW_PADDING;

      return (
        <g
          id={item.id}
          data-z-index={effectiveZIndex}
          data-on-drag={onDrag}
          {...attrs}
        >
          <rect
            width={getRowWidth(item)}
            height={rowHeight}
            fill={item.color}
            stroke="#aaa"
            strokeWidth={1.5}
            rx={6}
          />
          {/* Grip dots */}
          <g opacity={0.35}>
            {[0, 1, 2].map((i) =>
              [0, 1].map((j) => (
                <circle
                  cx={GRIP_WIDTH / 2 + 8 * j}
                  cy={rowHeight / 2 + (i - 1) * 8}
                  r={1.5}
                  fill="#333"
                />
              )),
            )}
          </g>
          {item.items.map((child, childIdx) => {
            const childX = xOffset;
            xOffset += getItemWidth(child) + TILE_GAP;
            return renderItem(
              child,
              [...itemsPath, idx, "items"] as PathIn<State, (Tile | Row)[]>,
              childIdx,
              effectiveZIndex + 1,
              { transform: translate(childX, ROW_PADDING) },
            );
          })}
        </g>
      );
    }
  }

  return (
    <g>
      {state.rows.map((row, rowIdx) =>
        renderItem(row, ["rows"], rowIdx, 0, { transform: translate(row) }),
      )}
    </g>
  );
};

export default demo(
  () => (
    <div>
      <DemoNotes>
        Like canvas of lists, but with recursively nested rows. Tiles and rows
        can be dragged between any level.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={600}
        height={400}
      />
    </div>
  ),
  { tags: ["d.floating", "d.vary", "spec.withBackground"] },
);
