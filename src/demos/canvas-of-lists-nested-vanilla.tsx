import { produce } from "immer";
import { useCallback, useEffect, useRef, useState } from "react";
import { demo } from "../demo";
import { DemoNotes } from "../demo/ui";

type Tile = { type: "tile"; id: string; label: string };
type Row = { type: "row"; id: string; items: (Tile | Row)[]; color: string };
type TopRow = Row & { x: number; y: number };
type State = { rows: TopRow[] };

const TILE_SIZE = 50;
const TILE_GAP = 8;
const ROW_PADDING = 8;
const GRIP_WIDTH = 16;
const GRIP_PADDING = 2;
const NEW_ROW_DIST = 50;

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

// --- Size helpers ---

function getItemWidth(item: Tile | Row): number {
  return item.type === "tile" ? TILE_SIZE : getRowWidth(item);
}

function getRowWidth(row: Row): number {
  const itemsWidth = row.items.reduce(
    (acc, item) => acc + getItemWidth(item) + TILE_GAP,
    -TILE_GAP,
  );
  return GRIP_WIDTH + GRIP_PADDING + itemsWidth + ROW_PADDING * 2;
}

function getRowHeight(row: Row): number {
  const maxH = Math.max(
    TILE_SIZE,
    ...row.items.map((i) => (i.type === "tile" ? TILE_SIZE : getRowHeight(i))),
  );
  return maxH + ROW_PADDING * 2;
}

// --- Drop zones ---

type DropZone = {
  rowPath: number[]; // indices from root to the target row
  insertIdx: number;
  x: number; // absolute x of the insertion line
  y: number; // absolute y
  height: number;
  color: string;
};

function computeDropZones(state: State): DropZone[] {
  const zones: DropZone[] = [];

  function traverse(row: Row, absX: number, absY: number, rowPath: number[]) {
    const rowHeight = getRowHeight(row);
    let x = GRIP_WIDTH + GRIP_PADDING + ROW_PADDING;

    for (let i = 0; i <= row.items.length; i++) {
      zones.push({
        rowPath,
        insertIdx: i,
        x: absX + x - TILE_GAP / 2,
        y: absY,
        height: rowHeight,
        color: row.color,
      });

      if (i < row.items.length) {
        const item = row.items[i];
        if (item.type === "row") {
          traverse(item, absX + x, absY + ROW_PADDING, [...rowPath, i]);
        }
        x += getItemWidth(item) + TILE_GAP;
      }
    }
  }

  for (let i = 0; i < state.rows.length; i++) {
    traverse(state.rows[i], state.rows[i].x, state.rows[i].y, [i]);
  }

  return zones;
}

function distToZone(zone: DropZone, px: number, py: number): number {
  const cy = Math.max(zone.y, Math.min(zone.y + zone.height, py));
  return Math.hypot(px - zone.x, py - cy);
}

function findClosestZone(
  zones: DropZone[],
  px: number,
  py: number,
): { zone: DropZone; dist: number } | null {
  let best: { zone: DropZone; dist: number } | null = null;
  for (const zone of zones) {
    const d = distToZone(zone, px, py);
    if (!best || d < best.dist) best = { zone, dist: d };
  }
  return best;
}

// --- Item path helpers ---

type ItemPath = number[];

function getItemAtPath(state: State, path: ItemPath): Tile | Row {
  if (path.length === 1) return state.rows[path[0]];
  let current: Row = state.rows[path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    current = current.items[path[i]] as Row;
  }
  return current.items[path[path.length - 1]];
}

function getItemAbsPos(state: State, path: ItemPath): { x: number; y: number } {
  let x = state.rows[path[0]].x;
  let y = state.rows[path[0]].y;
  if (path.length === 1) return { x, y };

  let current: Row = state.rows[path[0]];
  for (let depth = 1; depth < path.length; depth++) {
    x += GRIP_WIDTH + GRIP_PADDING + ROW_PADDING;
    y += ROW_PADDING;
    const idx = path[depth];
    for (let i = 0; i < idx; i++) {
      x += getItemWidth(current.items[i]) + TILE_GAP;
    }
    if (depth < path.length - 1) {
      current = current.items[idx] as Row;
    }
  }
  return { x, y };
}

function removeAtPath(state: State, path: ItemPath): State {
  return produce(state, (draft) => {
    if (path.length === 1) {
      draft.rows.splice(path[0], 1);
    } else {
      let current: Row = draft.rows[path[0]];
      for (let i = 1; i < path.length - 1; i++) {
        current = current.items[path[i]] as Row;
      }
      current.items.splice(path[path.length - 1], 1);
    }
  });
}

function insertAtZone(state: State, zone: DropZone, item: Tile | Row): State {
  return produce(state, (draft) => {
    let target: Row = draft.rows[zone.rowPath[0]];
    for (let i = 1; i < zone.rowPath.length; i++) {
      target = target.items[zone.rowPath[i]] as Row;
    }
    target.items.splice(zone.insertIdx, 0, item);
  });
}

// --- SVG helpers ---

function getSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  return {
    x: (clientX - ctm.e) / ctm.a,
    y: (clientY - ctm.f) / ctm.d,
  };
}

// --- Component ---

type DragInfo = {
  item: Tile | Row;
  stateWithout: State;
  zones: DropZone[];
  offsetX: number;
  offsetY: number;
};

const CanvasOfListsNestedVanilla = () => {
  const [state, setState] = useState<State>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const svgRef = useRef<SVGSVGElement>(null);

  const dragRef = useRef<DragInfo | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const moveHandlerRef = useRef<((e: PointerEvent) => void) | null>(null);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = getSvgPoint(svg, e.clientX, e.clientY);
    pointerRef.current = pt;
    setPointer(pt);
  }, []);

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current;
    const pt = pointerRef.current;
    if (drag && pt) {
      const closest = findClosestZone(drag.zones, pt.x, pt.y);
      if (closest && closest.dist < NEW_ROW_DIST) {
        setState(insertAtZone(drag.stateWithout, closest.zone, drag.item));
      } else {
        const dropX = pt.x - drag.offsetX;
        const dropY = pt.y - drag.offsetY;
        setState(
          produce(drag.stateWithout, (draft) => {
            if (drag.item.type === "tile") {
              draft.rows.push({
                type: "row",
                id: "row-" + Math.random().toString(36).slice(2),
                items: [drag.item],
                color: colors[draft.rows.length % colors.length],
                x: dropX,
                y: dropY,
              });
            } else {
              draft.rows.push({
                ...(drag.item as Row),
                x: dropX,
                y: dropY,
              });
            }
          }),
        );
      }
    }
    dragRef.current = null;
    pointerRef.current = null;
    setPointer(null);
    if (moveHandlerRef.current) {
      window.removeEventListener("pointermove", moveHandlerRef.current);
      moveHandlerRef.current = null;
    }
    window.removeEventListener("pointerup", handlePointerUp);
  }, []);

  const startItemDrag = useCallback(
    (e: React.PointerEvent, path: ItemPath) => {
      e.stopPropagation();
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const svgPt = getSvgPoint(svg, e.clientX, e.clientY);
      const currentState = stateRef.current;
      const item = getItemAtPath(currentState, path);
      const itemPos = getItemAbsPos(currentState, path);
      const stateWithout = removeAtPath(currentState, path);
      const zones = computeDropZones(stateWithout);

      dragRef.current = {
        item,
        stateWithout,
        zones,
        offsetX: svgPt.x - itemPos.x,
        offsetY: svgPt.y - itemPos.y,
      };
      pointerRef.current = svgPt;
      setPointer(svgPt);

      moveHandlerRef.current = handlePointerMove;
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [handlePointerMove, handlePointerUp],
  );

  useEffect(() => {
    return () => {
      if (moveHandlerRef.current)
        window.removeEventListener("pointermove", moveHandlerRef.current);
    };
  }, []);

  // --- Rendering ---

  const drag = dragRef.current;
  const baseState = drag ? drag.stateWithout : state;
  const closest =
    drag && pointer ? findClosestZone(drag.zones, pointer.x, pointer.y) : null;
  const showDrop = closest !== null && closest.dist < NEW_ROW_DIST;

  // Render a row and its children with interactive event handlers
  function renderRowContent(row: Row, path: ItemPath): React.ReactElement {
    const rowWidth = getRowWidth(row);
    const rowHeight = getRowHeight(row);
    let xOffset = GRIP_WIDTH + GRIP_PADDING + ROW_PADDING;

    return (
      <g
        style={{ cursor: "grab" }}
        onPointerDown={(e) => startItemDrag(e, path)}
      >
        <rect
          width={rowWidth}
          height={rowHeight}
          fill={row.color}
          stroke="#aaa"
          strokeWidth={1.5}
          rx={6}
        />
        {/* Grip dots */}
        <g opacity={0.35} style={{ pointerEvents: "none" }}>
          {[0, 1, 2].map((i) =>
            [0, 1].map((j) => (
              <circle
                key={`grip-${i}-${j}`}
                cx={GRIP_WIDTH / 2 + 8 * j}
                cy={rowHeight / 2 + (i - 1) * 8}
                r={1.5}
                fill="#333"
              />
            )),
          )}
        </g>
        {row.items.map((child, i) => {
          const childX = xOffset;
          xOffset += getItemWidth(child) + TILE_GAP;
          const childPath = [...path, i];

          if (child.type === "tile") {
            return (
              <g
                key={child.id}
                transform={`translate(${childX},${ROW_PADDING})`}
                style={{ cursor: "grab" }}
                onPointerDown={(e) => startItemDrag(e, childPath)}
              >
                <rect
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
                  {child.label}
                </text>
              </g>
            );
          } else {
            return (
              <g
                key={child.id}
                transform={`translate(${childX},${ROW_PADDING})`}
              >
                {renderRowContent(child, childPath)}
              </g>
            );
          }
        })}
      </g>
    );
  }

  // Render an item statically (no event handlers), for the floating preview
  function renderItemStatic(item: Tile | Row): React.ReactElement {
    if (item.type === "tile") {
      return (
        <g>
          <rect
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
      const rowWidth = getRowWidth(item);
      const rowHeight = getRowHeight(item);
      let xOffset = GRIP_WIDTH + GRIP_PADDING + ROW_PADDING;
      return (
        <g>
          <rect
            width={rowWidth}
            height={rowHeight}
            fill={item.color}
            stroke="#aaa"
            strokeWidth={1.5}
            rx={6}
          />
          <g opacity={0.35} style={{ pointerEvents: "none" }}>
            {[0, 1, 2].map((i) =>
              [0, 1].map((j) => (
                <circle
                  key={`grip-${i}-${j}`}
                  cx={GRIP_WIDTH / 2 + 8 * j}
                  cy={rowHeight / 2 + (i - 1) * 8}
                  r={1.5}
                  fill="#333"
                />
              )),
            )}
          </g>
          {item.items.map((child) => {
            const childX = xOffset;
            xOffset += getItemWidth(child) + TILE_GAP;
            return (
              <g
                key={child.id}
                transform={`translate(${childX},${ROW_PADDING})`}
              >
                {renderItemStatic(child)}
              </g>
            );
          })}
        </g>
      );
    }
  }

  return (
    <div>
      <DemoNotes>
        From-scratch React reimplementation of canvas-of-lists-nested,{" "}
        <b>without using Dragology</b>.
      </DemoNotes>
      <svg
        ref={svgRef}
        width={600}
        height={400}
        style={{ touchAction: "none" }}
      >
        {/* Base state (with dragged item removed during drag) */}
        {baseState.rows.map((row, i) => (
          <g key={row.id} transform={`translate(${row.x},${row.y})`}>
            {renderRowContent(row, [i])}
          </g>
        ))}

        {/* Drop indicator */}
        {showDrop && closest && (
          <rect
            x={closest.zone.x - 1.5}
            y={closest.zone.y + 4}
            width={3}
            height={closest.zone.height - 8}
            fill="#666"
            rx={1.5}
            style={{ pointerEvents: "none" }}
          />
        )}

        {/* Floating item following pointer */}
        {drag && pointer && (
          <g
            transform={`translate(${pointer.x - drag.offsetX},${pointer.y - drag.offsetY})`}
            opacity={0.7}
            style={{ pointerEvents: "none" }}
          >
            {renderItemStatic(drag.item)}
          </g>
        )}
      </svg>
      <DemoNotes>
        <i>Claude reports...</i> Differences from the library version:
        <ul className="list-disc pl-5 my-1 space-y-1">
          <li>
            The library shows the item snapping between candidate positions (via
            floating + closest); the vanilla version shows it floating at the
            pointer with a drop indicator
          </li>
          <li>No spring animations on drop</li>
          <li>
            No smooth transition between "insert into existing row" and "create
            new row" modes
          </li>
        </ul>
      </DemoNotes>
    </div>
  );
};

export default demo(CanvasOfListsNestedVanilla, {
  tags: ["vanilla"],
  cardClassName: "ring-2 ring-red-300",
});
