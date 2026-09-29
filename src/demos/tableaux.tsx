import { produce } from "immer";
import _ from "lodash";
import { ReactNode, useState } from "react";
import { amb, produceAmb } from "../amb";
import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable, OnDragCallback } from "../draggable";
import { translate } from "../svgx/helpers";

// An explanatory page about Young tableaux, with interactives threaded
// through the exposition:
//   1. Shapes – a Young diagram you edit by dragging corner boxes.
//   2. Fillings – swap entries of a tableau and see which rules break.
//   3. Row insertion – a step-by-step stepper (plain React, not a
//      draggable: the point is to watch the rule one bump at a time).
//   4. RSK – a permutation as a reorderable strip drives P and Q.
//   5. Jeu de taquin – slide a hole through a skew tableau; the legal
//      slides are exactly the ones that keep rows and columns ordered,
//      so a chained drag *is* the algorithm.

const S = 36; // cell size

// # Shared drawing helpers

type CellOpts<T extends object> = {
  fill?: string;
  stroke?: string;
  textFill?: string;
  dragologyOnDrag?: OnDragCallback<T>;
  dragologyZIndex?: string | number | false;
  dashed?: boolean;
  onClick?: () => void;
  cursor?: string;
};

function cell<T extends object>(
  id: string,
  r: number,
  c: number,
  label: string | number,
  opts: CellOpts<T> = {},
) {
  return cellG({ id, transform: translate(c * S, r * S), label, ...opts });
}

function cellG<T extends object>({
  id,
  transform,
  label,
  fill = "white",
  stroke = "#333",
  textFill = "#111",
  dragologyOnDrag,
  dragologyZIndex,
  dashed,
  onClick,
  cursor,
}: CellOpts<T> & {
  id: string;
  transform: string;
  label: string | number;
}) {
  return (
    <g
      id={id}
      transform={transform}
      dragologyOnDrag={dragologyOnDrag}
      dragologyZIndex={dragologyZIndex}
      onClick={onClick}
      style={
        cursor ? { cursor } : dragologyOnDrag ? { cursor: "grab" } : undefined
      }
    >
      <rect
        x={0}
        y={0}
        width={S}
        height={S}
        fill={fill}
        stroke={stroke}
        strokeWidth={dragologyOnDrag ? 2 : 1.5}
        strokeDasharray={dashed ? "4 3" : undefined}
      />
      <text
        x={S / 2}
        y={S / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={17}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill={textFill}
        pointerEvents="none"
      >
        {label}
      </text>
    </g>
  );
}

function caption(
  id: string,
  x: number,
  y: number,
  text: string,
  color = "#666",
) {
  return (
    <text
      id={id}
      transform={translate(x, y)}
      fontSize={12}
      fill={color}
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      pointerEvents="none"
    >
      {text}
    </text>
  );
}

// # Tableau math

type Entry = { id: string; value: number };
type Rows = Entry[][];

/** Row-insert `entry` into `rows` (Schensted). Returns the new rows
 * and the (r, c) of the cell that was added. Ids are stable, so
 * bumped entries can be animated. */
function rowInsert(
  rows: Rows,
  entry: Entry,
): { rows: Rows; r: number; c: number } {
  const newRows = rows.map((row) => [...row]);
  let x = entry;
  for (let r = 0; ; r++) {
    if (r === newRows.length) {
      newRows.push([x]);
      return { rows: newRows, r, c: 0 };
    }
    const row = newRows[r];
    const c = row.findIndex((e) => e.value > x.value);
    if (c === -1) {
      row.push(x);
      return { rows: newRows, r, c: row.length - 1 };
    }
    const bumped = row[c];
    row[c] = x;
    x = bumped;
  }
}

/** RSK on a word: insertion tableau P, recording tableau Q. */
function rsk(word: number[], idPrefix = ""): { P: Rows; Q: Rows } {
  let P: Rows = [];
  const Q: Rows = [];
  word.forEach((v, i) => {
    const res = rowInsert(P, { id: `${idPrefix}p-${v}`, value: v });
    P = res.rows;
    if (res.r === Q.length) Q.push([]);
    Q[res.r][res.c] = { id: `${idPrefix}q-${i + 1}`, value: i + 1 };
  });
  return { P, Q };
}

/** One longest increasing subsequence of `word` (as values). */
function longestIncreasing(word: number[]): number[] {
  const best: number[] = [];
  const prev: number[] = [];
  let end = -1;
  word.forEach((v, i) => {
    let len = 1;
    prev[i] = -1;
    for (let j = 0; j < i; j++) {
      if (word[j] < v && best[j] + 1 > len) {
        len = best[j] + 1;
        prev[i] = j;
      }
    }
    best[i] = len;
    if (end === -1 || len > best[end]) end = i;
  });
  const out: number[] = [];
  for (let i = end; i !== -1; i = prev[i]) out.unshift(word[i]);
  return out;
}

function drawRows(rows: Rows, x0: number, y0: number, fill: string) {
  return (
    <g transform={translate(x0, y0)}>
      {rows.map((row, r) =>
        row.map((e, c) => cell(e.id, r, c, e.value, { fill })),
      )}
    </g>
  );
}

// # Interactive 1: Shapes (Young diagrams)

type ShapeState = {
  boxes: Record<string, { r: number; c: number }>;
};

const shapeInitial: ShapeState = {
  boxes: {
    b1: { r: 0, c: 0 },
    b2: { r: 0, c: 1 },
    b3: { r: 0, c: 2 },
    b4: { r: 1, c: 0 },
    b5: { r: 1, c: 1 },
    b6: { r: 2, c: 0 },
    b7: { r: 2, c: 1 },
  },
};

function rowLengths(boxes: ShapeState["boxes"]): number[] {
  const lens: number[] = [];
  for (const { r } of Object.values(boxes)) lens[r] = (lens[r] ?? 0) + 1;
  return lens.map((l) => l ?? 0);
}

/** Cells that can be added to a shape while keeping it a partition. */
function addableCorners(lens: number[]): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = [];
  for (let r = 0; r <= lens.length; r++) {
    const len = lens[r] ?? 0;
    if (r === 0 || (lens[r - 1] ?? 0) > len) out.push({ r, c: len });
  }
  return out;
}

const shapeDraggable: Draggable<ShapeState> = ({ state, d, draggedId }) => {
  const lens = rowLengths(state.boxes);
  const n = Object.keys(state.boxes).length;
  const isRemovable = (r: number, c: number) =>
    c === lens[r] - 1 && (lens[r + 1] ?? 0) < lens[r];

  // where the dragged box could land
  const targets =
    draggedId && state.boxes[draggedId]
      ? addableCorners(rowLengths(_.omit(state.boxes, draggedId))).filter(
          ({ r, c }) =>
            !(r === state.boxes[draggedId].r && c === state.boxes[draggedId].c),
        )
      : [];

  return (
    <g transform={translate(10, 10)}>
      {targets.map(({ r, c }) => (
        <rect
          id={`target-${r}-${c}`}
          transform={translate(c * S, r * S)}
          width={S}
          height={S}
          fill="none"
          stroke="#9ca3af"
          strokeDasharray="4 3"
          dragologyZIndex={-1}
        />
      ))}
      {Object.entries(state.boxes).map(([id, b]) => {
        const removable = isRemovable(b.r, b.c);
        return cell(id, b.r, b.c, "", {
          fill: removable ? "#fef3c7" : "#f3f4f6",
          dragologyZIndex: draggedId === id ? "/1" : false,
          dragologyOnDrag: removable
            ? () => {
                const without = _.omit(state.boxes, id);
                const options = addableCorners(rowLengths(without)).map(
                  (pos) => ({ boxes: { ...without, [id]: pos } }),
                );
                return d.closest(options).withFloating();
              }
            : undefined,
        });
      })}
      {caption(
        "shape-caption",
        0,
        S * 5 + 6,
        `λ = (${lens.join(", ")}) — a partition of ${n}`,
      )}
    </g>
  );
};

// # Interactive 2: Fillings (the tableau rules)

type FillState = {
  cells: Record<string, { r: number; c: number; value: number }>;
  found: string[]; // valid fillings discovered so far, as keys
};

const FILL_SHAPE = [3, 2, 1];
const FILL_COUNT = 16; // standard tableaux of shape (3,2,1)

/** A filling as a string like "124/35/6". */
function fillKey(state: FillState): string {
  const rows: number[][] = FILL_SHAPE.map(() => []);
  for (const { r, c, value } of Object.values(state.cells)) rows[r][c] = value;
  return rows.map((row) => row.join("")).join("/");
}

const fillInitialCells: FillState["cells"] = {
  n1: { r: 0, c: 0, value: 1 },
  n2: { r: 0, c: 1, value: 2 },
  n4: { r: 0, c: 2, value: 4 },
  n3: { r: 1, c: 0, value: 3 },
  n5: { r: 1, c: 1, value: 5 },
  n6: { r: 2, c: 0, value: 6 },
};

const fillInitial: FillState = {
  cells: fillInitialCells,
  found: [fillKey({ cells: fillInitialCells, found: [] })],
};

function fillViolations(state: FillState) {
  const at = new Map<string, number>();
  for (const c of Object.values(state.cells)) at.set(`${c.r},${c.c}`, c.value);
  const out: { r: number; c: number; dir: "right" | "down" }[] = [];
  for (const { r, c, value } of Object.values(state.cells)) {
    const right = at.get(`${r},${c + 1}`);
    if (right !== undefined && right < value) out.push({ r, c, dir: "right" });
    const below = at.get(`${r + 1},${c}`);
    if (below !== undefined && below < value) out.push({ r, c, dir: "down" });
  }
  return out;
}

/** On drop: if the filling is valid and new, record it. */
function fillRecord(state: FillState): FillState {
  if (fillViolations(state).length > 0) return state;
  const key = fillKey(state);
  if (state.found.includes(key)) return state;
  return { ...state, found: [...state.found, key] };
}

const MINI = 13; // mini cell size for the gallery
const FILL_GALLERY_X = 3 * S + 80;
const FILL_GALLERY_COLS = 4;
const FILL_GALLERY_PITCH = 3 * MINI + 12;

const fillDraggable: Draggable<FillState> = ({ state, d, draggedId }) => {
  const violations = fillViolations(state);
  const currentKey = violations.length === 0 ? fillKey(state) : null;
  const complete = state.found.length === FILL_COUNT;
  return (
    <g transform={translate(10, 10)}>
      {Object.entries(state.cells).map(([id, cl]) =>
        cell(id, cl.r, cl.c, cl.value, {
          fill: "#dbeafe",
          dragologyZIndex: draggedId === id ? "/1" : false,
          dragologyOnDrag: () => {
            const swaps = Object.keys(state.cells)
              .filter((other) => other !== id)
              .map((other) =>
                produce(state, (s) => {
                  const a = s.cells[id];
                  const b = s.cells[other];
                  [a.r, a.c, b.r, b.c] = [b.r, b.c, a.r, a.c];
                }),
              );
            return d
              .closest([state, ...swaps])
              .withFloating()
              .onDrop(fillRecord);
          },
        }),
      )}
      {violations.map(({ r, c, dir }) => (
        <line
          id={`viol-${r}-${c}-${dir}`}
          transform={translate(c * S, r * S)}
          x1={dir === "right" ? S : 2}
          y1={dir === "right" ? 2 : S}
          x2={dir === "right" ? S : S - 2}
          y2={dir === "right" ? S - 2 : S}
          stroke="#dc2626"
          strokeWidth={5}
          strokeLinecap="round"
          pointerEvents="none"
        />
      ))}
      {violations.length === 0
        ? caption(
            "fill-caption",
            0,
            S * 3 + 20,
            "✓ a standard Young tableau",
            "#15803d",
          )
        : caption(
            "fill-caption",
            0,
            S * 3 + 20,
            `✗ ${violations.length} broken rule${violations.length === 1 ? "" : "s"}`,
            "#dc2626",
          )}

      {/* gallery: one blank template per standard tableau of this shape */}
      <g transform={translate(FILL_GALLERY_X, 0)}>
        {_.range(FILL_COUNT).map((i) => {
          const key = state.found[i];
          const isCurrent = key !== undefined && key === currentKey;
          const rows = key?.split("/") ?? FILL_SHAPE.map(() => "");
          const gx = (i % FILL_GALLERY_COLS) * FILL_GALLERY_PITCH;
          const gy = Math.floor(i / FILL_GALLERY_COLS) * FILL_GALLERY_PITCH;
          return (
            <g id={`slot-${i}`} transform={translate(gx, gy)}>
              {FILL_SHAPE.map((len, r) =>
                _.range(len).map((c) => (
                  <g
                    id={`slot-${i}-${r}-${c}`}
                    transform={translate(c * MINI, r * MINI)}
                  >
                    <rect
                      width={MINI}
                      height={MINI}
                      fill={
                        key
                          ? complete
                            ? isCurrent
                              ? "#fde68a"
                              : "#fef3c7"
                            : isCurrent
                              ? "#bfdbfe"
                              : "#dbeafe"
                          : "white"
                      }
                      stroke={key ? (complete ? "#b45309" : "#333") : "#d1d5db"}
                      strokeWidth={0.8}
                      strokeDasharray={key ? undefined : "2 2"}
                    />
                    {key && (
                      <text
                        x={MINI / 2}
                        y={MINI / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={8}
                        fontFamily="ui-sans-serif, system-ui, sans-serif"
                        fill="#111"
                        pointerEvents="none"
                      >
                        {rows[r][c]}
                      </text>
                    )}
                  </g>
                )),
              )}
            </g>
          );
        })}
        {complete &&
          caption(
            "fill-celebrate",
            0,
            Math.ceil(FILL_COUNT / FILL_GALLERY_COLS) * FILL_GALLERY_PITCH + 6,
            `🎉 All ${FILL_COUNT} standard Young tableaux of shape (3, 2, 1)!`,
            "#b45309",
          )}
        {!complete &&
          caption(
            "fill-progress",
            0,
            Math.ceil(FILL_COUNT / FILL_GALLERY_COLS) * FILL_GALLERY_PITCH + 6,
            `${state.found.length} of ${FILL_COUNT} found`,
          )}
      </g>
    </g>
  );
};

// # Interactive 3: Row insertion, step by step
//
// This one is deliberately *not* a Dragology draggable: the point is to
// see the bumping rule happen one step at a time, so it's a small React
// component with a "step" button and CSS transitions.

type StepState = {
  rows: Rows;
  queue: Entry[];
  held: { entry: Entry; row: number } | null; // the number waiting to go into `row`
  message: string;
};

const stepInitial: StepState = {
  rows: [
    [
      { id: "t1", value: 1 },
      { id: "t2", value: 2 },
      { id: "t3", value: 2 },
      { id: "t4", value: 5 },
    ],
    [
      { id: "t5", value: 3 },
      { id: "t6", value: 4 },
    ],
    [{ id: "t7", value: 6 }],
  ],
  queue: [
    { id: "w1", value: 1 },
    { id: "w2", value: 4 },
    { id: "w3", value: 2 },
    { id: "w4", value: 6 },
    { id: "w5", value: 3 },
  ],
  held: null,
  message: "Press “insert next number” to begin.",
};

/** Where the held number would go in its row: the leftmost bigger
 * entry, or the end of the row. */
function stepTarget(
  state: StepState,
): { c: number; bumps: Entry | null } | null {
  if (!state.held) return null;
  const row = state.rows[state.held.row] ?? [];
  const c = row.findIndex((e) => e.value > state.held!.entry.value);
  return c === -1 ? { c: row.length, bumps: null } : { c, bumps: row[c] };
}

function stepStart(state: StepState): StepState {
  const [next, ...rest] = state.queue;
  return {
    ...state,
    queue: rest,
    held: { entry: next, row: 0 },
    message: `Insert ${next.value}. Start at row 1.`,
  };
}

function stepOnce(state: StepState): StepState {
  const held = state.held!;
  const target = stepTarget(state)!;
  const r = held.row;
  const rows = state.rows.map((row) => [...row]);
  if (target.bumps === null) {
    if (r === rows.length) rows.push([]);
    rows[r].push(held.entry);
    return {
      ...state,
      rows,
      held: null,
      message:
        rows[r].length === 1
          ? `Row ${r + 1} didn’t exist, so ${held.entry.value} starts a new row. Done.`
          : `Nothing in row ${r + 1} is bigger than ${held.entry.value}, so it goes at the end. Done.`,
    };
  }
  rows[r][target.c] = held.entry;
  return {
    ...state,
    rows,
    held: { entry: target.bumps, row: r + 1 },
    message: `${target.bumps.value} is the leftmost entry of row ${r + 1} bigger than ${held.entry.value}: ${held.entry.value} takes its place and bumps ${target.bumps.value} down to row ${r + 2}.`,
  };
}

const STEP_HELD_X = -S - 16; // the held number sits just left of its row

function RowInsertionStepper() {
  const [state, setState] = useState<StepState>(stepInitial);
  const target = stepTarget(state);
  const numRows = Math.max(state.rows.length, (state.held?.row ?? -1) + 1);
  const tableauH = numRows * S;
  const queueY = tableauH + 44;

  const box = (
    e: Entry,
    x: number,
    y: number,
    extra: { bg?: string; ring?: string; dim?: boolean } = {},
  ) => (
    <div
      key={e.id}
      className="absolute flex items-center justify-center text-[17px] border-2 rounded-sm"
      style={{
        width: S,
        height: S,
        transform: `translate(${x}px, ${y}px)`,
        transition: "transform 450ms cubic-bezier(.2,.8,.2,1), opacity 300ms",
        background: extra.bg ?? "#dbeafe",
        borderColor: extra.ring ?? "#333",
        opacity: extra.dim ? 0.45 : 1,
        boxShadow: extra.ring ? `0 0 0 3px ${extra.ring}55` : undefined,
      }}
    >
      {e.value}
    </div>
  );

  const items: ReactNode[] = [];
  state.rows.forEach((row, r) =>
    row.forEach((e, c) => {
      const isTarget = state.held !== null && target?.bumps?.id === e.id;
      items.push(box(e, c * S, r * S, isTarget ? { ring: "#dc2626" } : {}));
    }),
  );
  if (state.held) {
    items.push(
      box(state.held.entry, STEP_HELD_X, state.held.row * S, {
        bg: "#fef3c7",
        ring: "#b45309",
      }),
    );
  }
  state.queue.forEach((e, i) => {
    items.push(box(e, i * (S + 6), queueY, { bg: "#fef3c7", dim: i > 0 }));
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center flex-wrap">
        <button
          className="px-3 py-1 text-sm rounded bg-amber-200 hover:bg-amber-300 disabled:opacity-40"
          disabled={state.held !== null || state.queue.length === 0}
          onClick={() => setState(stepStart(state))}
        >
          insert next number
        </button>
        <button
          className="px-3 py-1 text-sm rounded bg-blue-200 hover:bg-blue-300 disabled:opacity-40"
          disabled={state.held === null}
          onClick={() => setState(stepOnce(state))}
        >
          do this step
        </button>
        <button
          className="px-2 py-1 text-xs rounded bg-slate-200 hover:bg-slate-300"
          onClick={() => setState(stepInitial)}
        >
          reset
        </button>
      </div>
      <div
        className="relative mt-5"
        style={{
          width: 6 * S + 40,
          height: queueY + S + 4,
          marginLeft: -STEP_HELD_X,
        }}
      >
        <div
          className="absolute text-xs text-gray-500"
          style={{ transform: `translate(0px, ${-16}px)` }}
        >
          tableau
        </div>
        {/* the "slot" a held number is heading for, when it's the end of a row */}
        {state.held && target && target.bumps === null && (
          <div
            className="absolute border-2 border-dashed rounded-sm"
            style={{
              width: S,
              height: S,
              borderColor: "#dc2626",
              transform: `translate(${target.c * S}px, ${state.held.row * S}px)`,
            }}
          />
        )}
        {state.held && (
          <div
            className="absolute text-xs text-amber-800"
            style={{
              transform: `translate(${STEP_HELD_X}px, ${state.held.row * S - 14}px)`,
              transition: "transform 450ms cubic-bezier(.2,.8,.2,1)",
            }}
          >
            row {state.held.row + 1}
          </div>
        )}
        {items}
        <div
          className="absolute text-xs text-gray-500"
          style={{ transform: `translate(0px, ${queueY - 16}px)` }}
        >
          still to insert
        </div>
      </div>
      <div className="text-[13px] text-gray-800 max-w-[65ch] min-h-[2.5em]">
        {state.message}
      </div>
    </div>
  );
}

// # Interactive 4: RSK

type RskState = {
  perm: number[];
  k: number; // how many numbers have been inserted so far
};

const rskInitial: RskState = {
  perm: [4, 1, 6, 2, 5, 3],
  k: 6,
};

const RSK_TILE = S + 6;
const RSK_TAB_Y = S + 50;

const rskDraggable: Draggable<RskState> = ({ state, d, draggedId }) => {
  const n = state.perm.length;
  const prefix = state.perm.slice(0, state.k);
  const { P, Q } = rsk(prefix);
  const lis = longestIncreasing(prefix);
  const tabW = n * S + 30;
  return (
    <g transform={translate(10, 10)}>
      {caption("rsk-label-w", 0, -2, "permutation – reorder it")}

      {/* the word, as a reorderable strip */}
      {state.perm.map((v, i) =>
        cellG({
          id: `w-${v}`,
          transform: translate(i * RSK_TILE, 4),
          label: v,
          fill: i < state.k ? "#fef3c7" : "white",
          textFill: i < state.k ? "#111" : "#999",
          dragologyZIndex: draggedId === `w-${v}` ? "/1" : false,
          dragologyOnDrag: () => {
            const without = state.perm.filter((w) => w !== v);
            const options = produceAmb(state, (s) => {
              const idx = amb(_.range(n));
              s.perm = [...without];
              s.perm.splice(idx, 0, v);
            });
            return d.closest(options).whenFar(state).withFloating();
          },
        }),
      )}

      {/* the cursor: numbers left of it have been inserted */}
      <g
        id="cursor"
        transform={translate(state.k * RSK_TILE - 3, 0)}
        style={{ cursor: "ew-resize" }}
        dragologyOnDrag={() =>
          d.closest(_.range(n + 1).map((k) => ({ ...state, k })))
        }
      >
        <rect x={-6} y={-4} width={12} height={S + 16} fill="transparent" />
        <rect x={-1.5} y={-2} width={3} height={S + 12} fill="#dc2626" />
        <path d="M -6 -6 L 6 -6 L 0 0 Z" fill="#dc2626" />
      </g>

      {caption("rsk-label-p", 0, RSK_TAB_Y - 8, "P – insertion tableau")}
      {drawRows(P, 0, RSK_TAB_Y, "#dbeafe")}
      {caption("rsk-label-q", tabW, RSK_TAB_Y - 8, "Q – recording tableau")}
      {drawRows(Q, tabW, RSK_TAB_Y, "#dcfce7")}
      {caption(
        "rsk-lis",
        0,
        RSK_TAB_Y + 4 * S + 14,
        prefix.length === 0
          ? ""
          : `longest increasing subsequence: ${lis.join(" ")}  (length ${lis.length} = length of row 1)`,
      )}
    </g>
  );
};

// # Interactive 5: Jeu de taquin

type Box = { r: number; c: number; value: number };
type JdtState = {
  mu: number[]; // inner shape – the empty region at the top-left
  boxes: Record<string, Box>;
  hole: { r: number; c: number } | null;
};

const jdtInitial: JdtState = {
  mu: [2, 1],
  hole: null,
  boxes: {
    a: { r: 0, c: 2, value: 1 },
    b: { r: 0, c: 3, value: 3 },
    c: { r: 1, c: 1, value: 2 },
    d: { r: 1, c: 2, value: 5 },
    e: { r: 2, c: 0, value: 4 },
    f: { r: 2, c: 1, value: 6 },
    g: { r: 2, c: 2, value: 8 },
    h: { r: 3, c: 0, value: 7 },
  },
};

const cellKey = (r: number, c: number) => `${r},${c}`;

function boxAt(state: JdtState) {
  const map = new Map<string, string>();
  for (const [id, b] of Object.entries(state.boxes)) {
    map.set(cellKey(b.r, b.c), id);
  }
  return (r: number, c: number) => map.get(cellKey(r, c));
}

/** Is the tableau ordered (rows weakly, columns strictly), treating
 * the hole as transparent? Exactly the jeu de taquin rule falls out
 * of this: of the two boxes right of / below the hole, only the
 * smaller can slide in. */
function jdtValid(state: JdtState): boolean {
  const at = boxAt(state);
  const isHole = (r: number, c: number) =>
    state.hole !== null && state.hole.r === r && state.hole.c === c;
  const next = (r: number, c: number, dr: number, dc: number) => {
    let id = at(r + dr, c + dc);
    if (!id && isHole(r + dr, c + dc)) id = at(r + 2 * dr, c + 2 * dc);
    return id ? state.boxes[id].value : undefined;
  };
  for (const b of Object.values(state.boxes)) {
    const right = next(b.r, b.c, 0, 1);
    if (right !== undefined && right < b.value) return false;
    const below = next(b.r, b.c, 1, 0);
    if (below !== undefined && below <= b.value) return false;
  }
  return true;
}

/** Swap the hole with the box at (r, c), if there is one. */
function jdtSlide(state: JdtState, r: number, c: number): JdtState | undefined {
  if (!state.hole) return;
  const id = boxAt(state)(r, c);
  if (!id) return;
  const hole = state.hole;
  return produce(state, (s) => {
    s.boxes[id].r = hole.r;
    s.boxes[id].c = hole.c;
    s.hole = { r, c };
  });
}

const DIRS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

function jdtLegalSlides(state: JdtState): JdtState[] {
  if (!state.hole) return [];
  const { r, c } = state.hole;
  return DIRS.map(([dr, dc]) => jdtSlide(state, r + dr, c + dc)).filter(
    (s): s is JdtState => s !== undefined && jdtValid(s),
  );
}

function jdtAtOuterCorner(state: JdtState): boolean {
  if (!state.hole) return false;
  const at = boxAt(state);
  const { r, c } = state.hole;
  return !at(r, c + 1) && !at(r + 1, c);
}

/** Inner corners of mu – places a hole can be opened. */
function jdtInnerCorners(mu: number[]): { r: number; c: number }[] {
  return mu.flatMap((len, r) =>
    len > 0 && (mu[r + 1] ?? 0) < len ? [{ r, c: len - 1 }] : [],
  );
}

/** Reading word: rows from bottom to top, each left to right. */
function jdtReadingWord(state: JdtState): number[] {
  return _.sortBy(
    Object.values(state.boxes),
    (b) => -b.r,
    (b) => b.c,
  ).map((b) => b.value);
}

const JDT_SIDE_X = 6 * S;

const jdtDraggable: Draggable<JdtState> = ({ state, d, setState }) => {
  const atCorner = jdtAtOuterCorner(state);
  const rectified = state.hole === null && state.mu.every((l) => l === 0);
  const word = jdtReadingWord(state);
  const wordP = rsk(word, "rw-").P;
  return (
    <g transform={translate(10, 10)}>
      {/* the inner shape mu, drawn as faint squares */}
      {state.mu.map((len, r) =>
        _.range(len).map((c) => (
          <rect
            id={`mu-${r}-${c}`}
            transform={translate(c * S, r * S)}
            width={S}
            height={S}
            fill="#f3f4f6"
            dragologyZIndex={-1}
          />
        )),
      )}

      {/* inner corners: click to open a hole */}
      {state.hole === null &&
        jdtInnerCorners(state.mu).map(({ r, c }) =>
          cell(`open-${r}-${c}`, r, c, "+", {
            fill: "#f3f4f6",
            stroke: "#9ca3af",
            textFill: "#9ca3af",
            dashed: true,
            cursor: "pointer",
            onClick: () =>
              setState(
                produce(state, (s) => {
                  s.mu[r] -= 1;
                  s.hole = { r, c };
                }),
                { transition: 150 },
              ),
          }),
        )}

      {/* the hole */}
      {state.hole &&
        cell("hole", state.hole.r, state.hole.c, atCorner ? "×" : "", {
          fill: "#fde68a",
          stroke: "#b45309",
          textFill: "#b45309",
          dashed: true,
          cursor: atCorner ? "pointer" : "grab",
          // at an outer corner, click to close the hole
          onClick: atCorner
            ? () => setState({ ...state, hole: null }, { transition: 150 })
            : undefined,
          dragologyOnDrag: () =>
            d
              .closest(
                jdtLegalSlides(state).map((slid) => d.between([state, slid])),
              )
              .withSnapRadius(10, { chain: true }),
        })}

      {/* boxes */}
      {Object.entries(state.boxes).map(([id, b]) => {
        const adjacentToHole =
          state.hole !== null &&
          Math.abs(state.hole.r - b.r) + Math.abs(state.hole.c - b.c) === 1;
        const slid = adjacentToHole ? jdtSlide(state, b.r, b.c) : undefined;
        const legal = slid !== undefined && jdtValid(slid);
        return cell(`box-${id}`, b.r, b.c, b.value, {
          fill: legal ? "#fef3c7" : "white",
          dragologyOnDrag: legal ? () => d.between([state, slid]) : undefined,
        });
      })}

      {rectified &&
        caption(
          "hint",
          0,
          S * 4.7,
          "rectified – a straight tableau!",
          "#15803d",
        )}
      {!rectified &&
        state.hole === null &&
        caption("hint", 0, S * 4.7, "click a + to open a hole")}
      {atCorner &&
        caption("hint", 0, S * 4.7, "at an outer corner – click × to close")}

      {/* side panel: reading word and its insertion tableau */}
      <g transform={translate(JDT_SIDE_X, 0)}>
        {caption("rw-label", 0, -2, "reading word (rows bottom to top)")}
        {caption("rw-word", 0, 16, word.join(" "), "#111")}
        {caption("rw-p-label", 0, 40, "its insertion tableau P")}
        {drawRows(wordP, 0, 46, "#dbeafe")}
      </g>
    </g>
  );
};

// # The page

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="ml-2 px-2 py-0.5 text-xs rounded bg-slate-200 hover:bg-slate-300 not-italic font-normal align-middle"
      onClick={onClick}
    >
      reset
    </button>
  );
}

function P({
  children,
  className = "text-gray-800",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-[15px] leading-relaxed mb-3 max-w-[65ch] ${className}`}>
      {children}
    </p>
  );
}

function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">
      {children}
    </h2>
  );
}

function Figure({
  children,
  caption,
}: {
  children: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <div className="my-4 pl-4 border-l-4 border-amber-200">
      {children}
      {caption && (
        <div className="text-[13px] text-gray-600 mt-1 max-w-[65ch] italic">
          {caption}
        </div>
      )}
    </div>
  );
}

function Try({ children }: { children: ReactNode }) {
  return (
    <span className="font-semibold text-amber-800 not-italic">
      Try it: {children}
    </span>
  );
}

export default demo(
  () => {
    const [shapeKey, setShapeKey] = useState(0);
    const [fillKey, setFillKey] = useState(0);
    const [rskKey, setRskKey] = useState(0);
    const [jdtKey, setJdtKey] = useState(0);

    return (
      <div className="flex flex-col">
        <P>
          This is a short, hands-on introduction to <b>Young tableaux</b>: grids
          of numbers that show up all over combinatorics, representation theory,
          and even the study of random sorting. No background is assumed beyond
          being comfortable with whole numbers. Every idea comes with something
          to drag, and the algorithms in this subject are unusually well suited
          to dragging: each one is a rule for how boxes move, and each drag
          below is that rule made physical.
        </P>

        <H2>1. Shapes</H2>
        <P>
          A <b>partition</b> of a number <i>n</i> is a way of writing it as a
          sum of positive whole numbers, written in decreasing order. For
          example, (3, 2, 2) is a partition of 7. We draw a partition as a{" "}
          <b>Young diagram</b>: rows of boxes, stacked top to bottom, each row
          no longer than the one above it and all flush against the left edge.
        </P>
        <Figure
          caption={
            <>
              <Try>
                drag a highlighted corner box somewhere else. The dashed squares
                show where it can land.
              </Try>{" "}
              Only some boxes are draggable: a box can be removed only if
              nothing is to its right or below it, and it can be dropped only
              where the result is still a Young diagram. Those two positions are
              called <i>removable</i> and <i>addable</i> corners.
            </>
          }
        >
          <ResetButton onClick={() => setShapeKey((k) => k + 1)} />
          <DemoDraggable
            key={shapeKey}
            draggable={shapeDraggable}
            initialState={shapeInitial}
            width={260}
            height={S * 5 + 24}
          />
        </Figure>
        <P>
          A single-row diagram and a single-column diagram are the two extremes;
          everything else is somewhere in between. Keep the notion of a "corner"
          in mind. It comes back when we grow tableaux one box at a time.
        </P>

        <H2>2. Fillings: the two rules</H2>
        <P>
          A <b>Young tableau</b> is a Young diagram with a number in every box,
          obeying two rules: numbers <b>increase along each row</b>, left to
          right, and <b>increase down each column</b>, top to bottom. If the
          numbers are exactly 1, 2, …, <i>n</i> with each used once, it is a{" "}
          <b>standard</b> Young tableau. (If repeats are allowed and rows are
          only required to be non-decreasing, it is <i>semistandard</i>. We'll
          mostly use standard ones.)
        </P>
        <Figure
          caption={
            <>
              <Try>
                drag a number onto another box to swap them. Broken rules show
                up as red edges.
              </Try>{" "}
              Notice that 1 has to be in the top-left corner and <i>n</i> has to
              be at a removable corner. Each valid filling you land on fills in
              one of the blank templates on the right. Can you find all 16?
            </>
          }
        >
          <ResetButton onClick={() => setFillKey((k) => k + 1)} />
          <DemoDraggable
            key={fillKey}
            draggable={fillDraggable}
            initialState={fillInitial}
            width={FILL_GALLERY_X + FILL_GALLERY_COLS * FILL_GALLERY_PITCH + 10}
            height={
              Math.ceil(FILL_COUNT / FILL_GALLERY_COLS) * FILL_GALLERY_PITCH +
              30
            }
          />
        </Figure>
        <P>
          Counting standard tableaux of a given shape is a famous problem; the
          answer is given by the beautiful <i>hook length formula</i>. But
          rather than count them, we're going to <i>build</i> them, using an
          algorithm whose every step is a little cascade of motion.
        </P>

        <H2>3. Row insertion: the bumping rule</H2>
        <P>
          Here is the central operation of this whole subject. To{" "}
          <b>row-insert</b> a number <i>x</i> into a tableau:
        </P>
        <ol className="list-decimal pl-6 text-[15px] leading-relaxed text-gray-800 mb-3 max-w-[65ch]">
          <li>
            Look at the first row. If <i>x</i> is at least as big as everything
            there, add it at the end of the row. Done.
          </li>
          <li>
            Otherwise, find the leftmost entry that is bigger than <i>x</i>. Put{" "}
            <i>x</i> in its place and <b>bump</b> that entry out.
          </li>
          <li>Insert the bumped entry into the next row, by the same rule.</li>
        </ol>
        <P>
          The bumped entry can bump another, which can bump another, and so on.
          Each bump moves an entry one row down, and the cascade ends when
          something lands at the end of a row (possibly a brand-new row). The
          tableau grows by exactly one box, at a corner, and stays a valid
          tableau.
        </P>
        <Figure
          caption={
            <>
              <Try>
                press “insert next number”, then “do this step” repeatedly. The
                number being inserted waits beside the row it is about to enter;
                the entry it will bump is outlined in red.
              </Try>{" "}
              The first number, 1, bumps a 2, which bumps the 3, which bumps the
              6 into a brand-new row: four boxes move for one insertion. The 6
              later on just lands at the end of the top row. In general, small
              numbers cause long cascades and big numbers cause short ones.
            </>
          }
        >
          <RowInsertionStepper />
        </Figure>

        <H2>4. From a permutation to a pair of tableaux</H2>
        <P>
          Now take a <b>permutation</b>, a shuffling of 1, …, <i>n</i>, like 4 1
          6 2 5 3, and row-insert its numbers one at a time into an empty
          tableau. The result is a standard Young tableau <b>P</b>, the{" "}
          <b>insertion tableau</b>. Along the way, each insertion added one new
          box; write the step number (1, 2, 3, …) into that box in a second
          diagram of the same shape. That second diagram is <b>Q</b>, the{" "}
          <b>recording tableau</b>, and it is automatically standard too: later
          boxes are always added at corners, so they sit right of and below
          earlier ones.
        </P>
        <P>
          This is the <b>Robinson–Schensted correspondence</b> (RSK, with a K
          for Knuth, who generalized it). Its headline property is that it is a{" "}
          <i>bijection</i>: from the pair (P, Q) you can run the whole thing
          backwards and recover the permutation, so every permutation of{" "}
          <i>n</i> corresponds to exactly one pair of same-shaped standard
          tableaux, and vice versa. Squaring the number of tableaux of each
          shape and adding over all shapes gives <i>n</i>!, a fact that is far
          from obvious if you try to prove it any other way.
        </P>
        <Figure
          caption={
            <>
              <Try>
                drag numbers around in the strip to change the permutation and
                watch both tableaux reconfigure. Drag the red cursor left to
                insert only the first few numbers and step through the
                algorithm.
              </Try>{" "}
              Some things to look for: sort the strip into 1 2 3 4 5 6 and both
              tableaux collapse into a single row; reverse it and they become a
              single column. In general, the length of the top row of P equals
              the length of the <b>longest increasing subsequence</b> of the
              permutation (Schensted's theorem), and the number of rows equals
              the longest decreasing one.
            </>
          }
        >
          <ResetButton onClick={() => setRskKey((k) => k + 1)} />
          <DemoDraggable
            key={rskKey}
            draggable={rskDraggable}
            initialState={rskInitial}
            width={6 * S + 30 + 6 * S + 30}
            height={RSK_TAB_Y + 4 * S + 24}
          />
        </Figure>
        <P>
          Schensted's theorem is why RSK matters outside pure combinatorics: the
          top-row length of a random permutation's tableau is the length of its
          longest increasing subsequence, and understanding how that length
          fluctuates for large <i>n</i> turned out to connect to random matrices
          and a great deal of modern probability.
        </P>

        <H2>5. Sliding: jeu de taquin</H2>
        <P>
          Finally, a different way to move boxes. Take a Young diagram and cut a
          smaller Young diagram out of its top-left corner. What remains is a{" "}
          <b>skew shape</b>, and a filling of it obeying the two rules is a{" "}
          <b>skew tableau</b>. The grey region below is the cut-out part.
        </P>
        <P>
          <b>Jeu de taquin</b> ("the teasing game", after the French name for
          the 15-puzzle) is a way to slide the skew tableau inward until the
          hole is gone. Open a hole at an inner corner of the grey region. Two
          boxes can slide into it: the one to its right and the one below. Slide
          in the <b>smaller</b> of the two. That moves the hole one step right
          or down; repeat until the hole reaches the outside edge of the shape,
          where it can simply be closed. Doing this until no grey region is left
          is called <b>rectification</b>.
        </P>
        <P>
          Why the smaller one? Because it's the only choice that keeps the rows
          and columns in order. In this interactive, the legal moves are
          computed by exactly that test, "does the result still obey the two
          rules?", and the algorithm falls out on its own. That is also why the
          drag chains: as soon as one slide completes, the next legal slide is
          offered, so one continuous drag walks the hole all the way out.
        </P>
        <Figure
          caption={
            <>
              <Try>
                click a <b>+</b> to open a hole, then drag it. Keep dragging
                toward the bottom-right and it will chain through every slide;
                back up and the slides undo. At the edge, click × to close it.
                Repeat until the grey region is gone.
              </Try>{" "}
              Two theorems to test. First, the result of rectification does not
              depend on which inner corner you choose at each stage: reset and
              try the corners in a different order. Second, the "reading word"
              (the entries read row by row, bottom to top) changes as you slide,
              but its insertion tableau under RSK <i>never</i> does, and it
              equals the rectified tableau.
            </>
          }
        >
          <ResetButton onClick={() => setJdtKey((k) => k + 1)} />
          <DemoDraggable
            key={jdtKey}
            draggable={jdtDraggable}
            initialState={jdtInitial}
            width={JDT_SIDE_X + 6 * S + 20}
            height={46 + 4 * S + 24}
          />
        </Figure>
        <P>
          That last fact is the bridge between the two halves of this page. Row
          insertion and jeu de taquin look like unrelated procedures, one
          building tableaux from words and the other sliding tableaux around,
          but they compute the same thing: the insertion tableau of a word is an
          invariant that slides preserve, and rectification is one way to reach
          it. Words with the same insertion tableau are called{" "}
          <i>Knuth equivalent</i>, and this equivalence is the combinatorial
          heart of the theory of symmetric functions and of the representation
          theory of the symmetric group.
        </P>

        <H2>Where to go next</H2>
        <P>
          William Fulton's <i>Young Tableaux</i> is the classic short book and
          covers everything here in its first two chapters. Richard Stanley's{" "}
          <i>Enumerative Combinatorics, Volume 2</i>, chapter 7, is the standard
          reference for RSK and its consequences. For the probability story,
          search for "longest increasing subsequence" and
          "Baik–Deift–Johansson".
        </P>
        <P className="text-gray-500">
          <i>
            About the interactives: each one is a Dragology draggable, a
            function from state to picture with drag specs attached. The bumping
            cascade in §3 is <code>d.between</code> interpolating two
            renderings; the strip in §4 is a reorderable list with floating; the
            chained slides in §5 are the same idiom as a sliding-block puzzle,
            with the legal moves filtered by the tableau rules.
          </i>
        </P>
      </div>
    );
  },
  {
    tags: [
      "d.between",
      "d.closest",
      "spec.withSnapRadius [chain]",
      "spec.withFloating",
      "spec.whenFar",
      "reordering",
      "math",
      "explainer",
    ],
  },
);
