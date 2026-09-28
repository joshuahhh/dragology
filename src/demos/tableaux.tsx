import { produce } from "immer";
import _ from "lodash";
import { useState } from "react";
import { amb, produceAmb } from "../amb";
import { demo } from "../demo";
import {
  ConfigCheckbox,
  ConfigPanel,
  DemoDraggable,
  DemoNotes,
  DemoWithConfig,
} from "../demo/ui";
import { Draggable, OnDragCallback } from "../draggable";
import { translate } from "../svgx/helpers";

// Three linked panels about Young tableaux:
//   1. Jeu de taquin – slide a hole through a skew tableau. The
//      legal slides are exactly the ones that keep rows and columns
//      ordered, so a chained drag *is* the algorithm.
//   2. Row insertion – drag a number into a tableau and watch the
//      bumping cascade, which falls out of interpolating between the
//      "before" and "after" tableaux.
//   3. RSK – a permutation as a reorderable strip drives the
//      insertion tableau P and the recording tableau Q.

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

function caption(id: string, x: number, y: number, text: string) {
  return (
    <text
      id={id}
      transform={translate(x, y)}
      fontSize={12}
      fill="#666"
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
function rsk(word: number[]): { P: Rows; Q: Rows } {
  let P: Rows = [];
  const Q: Rows = [];
  word.forEach((v, i) => {
    const res = rowInsert(P, { id: `p-${v}`, value: v });
    P = res.rows;
    if (res.r === Q.length) Q.push([]);
    Q[res.r][res.c] = { id: `q-${i + 1}`, value: i + 1 };
  });
  return { P, Q };
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

// # Panel 1: Jeu de taquin

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

const jdtDraggable: Draggable<JdtState> = ({ state, d, setState }) => {
  const atCorner = jdtAtOuterCorner(state);
  const rectified = state.hole === null && state.mu.every((l) => l === 0);
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
        cell("hole", state.hole.r, state.hole.c, atCorner ? "\u00d7" : "", {
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
        caption("rectified", 0, S * 4.7, "rectified – a straight tableau!")}
      {!rectified &&
        state.hole === null &&
        caption("hint", 0, S * 4.7, "click a + to open a hole")}
      {atCorner &&
        caption(
          "hint",
          0,
          S * 4.7,
          "hole at an outer corner – click \u00d7 to close",
        )}
    </g>
  );
};

// # Panel 2: Row insertion

type InsState = {
  rows: Rows;
  strip: Entry[];
};

const insInitial: InsState = {
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
  strip: [
    { id: "w1", value: 2 },
    { id: "w2", value: 1 },
    { id: "w3", value: 4 },
    { id: "w4", value: 3 },
    { id: "w5", value: 6 },
  ],
};

const INS_STRIP_Y = 5 * S + 30;

function insDraggableFactory(config: {
  floating: boolean;
}): Draggable<InsState> {
  return ({ state, d, draggedId }) => (
    <g transform={translate(10, 10)}>
      {caption("ins-label-t", 0, -2, "tableau")}
      {state.rows.map((row, r) =>
        row.map((e, c) => cell(e.id, r, c, e.value, { fill: "#dbeafe" })),
      )}

      {caption("ins-label-w", 0, INS_STRIP_Y - 8, "word – drag a letter in")}
      {state.strip.map((e, i) => {
        const inserted: InsState = {
          rows: rowInsert(state.rows, e).rows,
          strip: state.strip.filter((s) => s.id !== e.id),
        };
        return cellG({
          id: e.id,
          transform: translate(i * (S + 6), INS_STRIP_Y),
          label: e.value,
          fill: "#fef3c7",
          dragologyZIndex: draggedId === e.id ? "/1" : false,
          dragologyOnDrag: () => {
            const spec = d.between([state, inserted]);
            return config.floating ? spec.withFloating() : spec;
          },
        });
      })}
    </g>
  );
}

// # Panel 3: RSK

type RskState = {
  perm: number[];
  k: number; // how many letters have been inserted so far
};

const rskInitial: RskState = {
  perm: [4, 1, 6, 2, 5, 3],
  k: 6,
};

const RSK_TILE = S + 6;
const RSK_TAB_Y = S + 50;

const rskDraggable: Draggable<RskState> = ({ state, d, draggedId }) => {
  const n = state.perm.length;
  const { P, Q } = rsk(state.perm.slice(0, state.k));
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

      {/* the cursor: letters left of it have been inserted */}
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
        <path
          d="M -6 -6 L 6 -6 L 0 0 Z"
          transform={translate(0, 0)}
          fill="#dc2626"
        />
      </g>

      {caption("rsk-label-p", 0, RSK_TAB_Y - 8, "P – insertion tableau")}
      {drawRows(P, 0, RSK_TAB_Y, "#dbeafe")}
      {caption("rsk-label-q", tabW, RSK_TAB_Y - 8, "Q – recording tableau")}
      {drawRows(Q, tabW, RSK_TAB_Y, "#dcfce7")}
    </g>
  );
};

// # The page

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="px-2 py-0.5 text-xs rounded bg-slate-200 hover:bg-slate-300"
      onClick={onClick}
    >
      reset
    </button>
  );
}

export default demo(
  () => {
    const [jdtKey, setJdtKey] = useState(0);
    const [insKey, setInsKey] = useState(0);
    const [floating, setFloating] = useState(false);

    return (
      <div className="flex flex-col gap-8">
        <div>
          <h3 className="text-md font-medium italic mb-1">
            1. Jeu de taquin{" "}
            <ResetButton onClick={() => setJdtKey((k) => k + 1)} />
          </h3>
          <DemoNotes>
            A skew tableau. Click a <b>+</b> to open a hole at an inner corner,
            then drag the hole (or drag a highlighted neighbor into it). The
            only legal slides are the ones that keep rows and columns ordered –
            so the chained drag <i>is</i> the jeu de taquin algorithm. When the
            hole reaches an outer corner, click it to close it. Repeat until
            there's no inner shape left: that's rectification.
          </DemoNotes>
          <DemoDraggable
            key={jdtKey}
            draggable={jdtDraggable}
            initialState={jdtInitial}
            width={200}
            height={200}
          />
        </div>

        <div>
          <h3 className="text-md font-medium italic mb-1">
            2. Row insertion{" "}
            <ResetButton onClick={() => setInsKey((k) => k + 1)} />
          </h3>
          <DemoNotes>
            Drag a letter of the word into the tableau. It bumps the first
            larger entry in row 1 to row 2, which bumps an entry to row 3, and
            so on. The whole cascade is just interpolation between the tableau
            before and after insertion.
          </DemoNotes>
          <DemoWithConfig>
            <DemoDraggable
              key={insKey}
              draggable={insDraggableFactory({ floating })}
              initialState={insInitial}
              width={260}
              height={INS_STRIP_Y + S + 20}
            />
            <ConfigPanel>
              <ConfigCheckbox
                label="withFloating (letter follows the pointer)"
                value={floating}
                onChange={setFloating}
              />
            </ConfigPanel>
          </DemoWithConfig>
        </div>

        <div>
          <h3 className="text-md font-medium italic mb-1">
            3. RSK correspondence
          </h3>
          <DemoNotes>
            A permutation, row-inserted letter by letter, gives an insertion
            tableau <b>P</b>; recording which cell appeared at each step gives{" "}
            <b>Q</b>. Reorder the strip and watch both tableaux reconfigure.
            Drag the red cursor to insert only a prefix of the word.
          </DemoNotes>
          <DemoDraggable
            draggable={rskDraggable}
            initialState={rskInitial}
            width={6 * S + 30 + 6 * S + 30}
            height={RSK_TAB_Y + 4 * S + 20}
          />
        </div>
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
    ],
  },
);
