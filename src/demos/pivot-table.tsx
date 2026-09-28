import _ from "lodash";
import { amb, produceAmb } from "../amb";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

// # Data

const DIMENSIONS = {
  region: ["North", "South", "West"],
  product: ["Widgets", "Gadgets", "Gizmos"],
  quarter: ["Q1", "Q2", "Q3", "Q4"],
} as const;
type Dimension = keyof typeof DIMENSIONS;
const DIMENSION_ORDER = Object.keys(DIMENSIONS) as Dimension[];

const MEASURES = ["sales", "units"] as const;
type Measure = (typeof MEASURES)[number];
// Used for cells when there is nothing in the Values zone.
type CellMeasure = Measure | "count";

type Field = Dimension | Measure;

function isDimension(field: Field): field is Dimension {
  return field in DIMENSIONS;
}

type Record_ = { [D in Dimension]: string } & { [M in Measure]: number };

// Deterministic pseudo-random data (LCG), so the demo is stable.
function makeRecords(): Record_[] {
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const records: Record_[] = [];
  for (const region of DIMENSIONS.region) {
    for (const product of DIMENSIONS.product) {
      for (const quarter of DIMENSIONS.quarter) {
        const units = 5 + Math.floor(rand() * 60);
        const price = 8 + Math.floor(rand() * 12);
        records.push({ region, product, quarter, units, sales: units * price });
      }
    }
  }
  return records;
}
const RECORDS = makeRecords();

// # State

type Zone = "rows" | "cols" | "values" | "unused";
const ZONE_ORDER: Zone[] = ["unused", "rows", "cols", "values"];
const ZONE_LABELS: { [Z in Zone]: string } = {
  unused: "Fields",
  rows: "Rows",
  cols: "Columns",
  values: "Values",
};

type State = {
  zones: { [Z in Zone]: Field[] };
};

export const initialState: State = {
  zones: {
    unused: ["units"],
    rows: ["region", "product"],
    cols: ["quarter"],
    values: ["sales"],
  },
};

function allowedZones(field: Field): Zone[] {
  return isDimension(field) ? ["unused", "rows", "cols"] : ["unused", "values"];
}

// # Pivoting

/** A tuple of values for the given dimensions, e.g. ["North", "Widgets"]. */
type Tuple = string[];

/** All tuples for the given dimensions, in nested domain order. */
function tuplesFor(dims: Dimension[]): Tuple[] {
  return dims.reduce<Tuple[]>(
    (acc, dim) => acc.flatMap((t) => DIMENSIONS[dim].map((v) => [...t, v])),
    [[]],
  );
}

function matches(rec: Record_, dims: Dimension[], tuple: Tuple): boolean {
  return dims.every((dim, i) => rec[dim] === tuple[i]);
}

function aggregate(
  rowDims: Dimension[],
  rowTuple: Tuple,
  colDims: Dimension[],
  colTuple: Tuple,
  measure: CellMeasure,
): number {
  let total = 0;
  for (const rec of RECORDS) {
    if (matches(rec, rowDims, rowTuple) && matches(rec, colDims, colTuple)) {
      total += measure === "count" ? 1 : rec[measure];
    }
  }
  return total;
}

/**
 * A stable id fragment for a group of records, independent of whether
 * its dimensions live in Rows or Columns. This is what lets a cell
 * keep its identity (and so animate) when the table re-pivots.
 */
function groupId(
  rowDims: Dimension[],
  rowTuple: Tuple,
  colDims: Dimension[],
  colTuple: Tuple,
): string {
  const assignments: Partial<{ [D in Dimension]: string }> = {};
  rowDims.forEach((dim, i) => (assignments[dim] = rowTuple[i]));
  colDims.forEach((dim, i) => (assignments[dim] = colTuple[i]));
  return DIMENSION_ORDER.filter((dim) => dim in assignments)
    .map((dim) => `${dim}-${assignments[dim]}`)
    .join("-");
}

/** Id fragment for a header cell: the path of dims/values above it. */
function pathId(dims: Dimension[], tuple: Tuple): string {
  return dims.map((dim, i) => `${dim}-${tuple[i]}`).join("-");
}

// # Layout constants

const CANVAS_W = 720;
const CANVAS_H = 800;

const CHIP_W = 64;
const CHIP_H = 22;
const CHIP_GAP = 4;
const ZONE_PAD = 6;
const ZONE_GAP = 12;
const ZONE_MIN_W = 70;
const ZONE_LABEL_Y = 11;
const ZONE_BOX_Y = 16;
const ZONE_BOX_H = CHIP_H + ZONE_PAD * 2;

const TABLE_Y = ZONE_BOX_Y + ZONE_BOX_H + 18;
const ROW_H = 18;
const ROW_HEADER_W = 76;
const MAX_CELL_W = 64;
const MIN_CELL_W = 8;
const MIN_TEXT_CELL_W = 32;

const DIM_COLOR = "#bfdbfe";
const DIM_STROKE = "#3b82f6";
const MEASURE_COLOR = "#fed7aa";
const MEASURE_STROKE = "#f97316";

const MEASURE_HUES: { [M in CellMeasure]: [number, number, number] } = {
  sales: [59, 130, 246],
  units: [249, 115, 22],
  count: [107, 114, 128],
};

function heat(measure: CellMeasure, t: number): string {
  const [r, g, b] = MEASURE_HUES[measure];
  const mix = (c: number) => Math.round(255 + (c - 255) * t * 0.55);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function chipColors(field: Field) {
  return isDimension(field)
    ? { fill: DIM_COLOR, stroke: DIM_STROKE }
    : { fill: MEASURE_COLOR, stroke: MEASURE_STROKE };
}

// # Rendering

export const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  const rowDims = state.zones.rows as Dimension[];
  const colDims = state.zones.cols as Dimension[];
  const measures: CellMeasure[] =
    state.zones.values.length > 0
      ? (state.zones.values as Measure[])
      : ["count"];

  // ## Zones & chips

  const zoneWidths = _.mapValues(state.zones, (fields) =>
    Math.max(
      ZONE_MIN_W,
      ZONE_PAD * 2 + fields.length * CHIP_W + (fields.length - 1) * CHIP_GAP,
    ),
  );
  const zoneXs: { [Z in Zone]?: number } = {};
  let x = 0;
  for (const zone of ZONE_ORDER) {
    zoneXs[zone] = x;
    x += zoneWidths[zone] + ZONE_GAP;
  }

  const chipSpec = (field: Field) => {
    const zones = allowedZones(field);
    const candidates = produceAmb(state, (draft) => {
      for (const zone of ZONE_ORDER) {
        _.pull(draft.zones[zone], field);
      }
      const zone = amb(zones);
      const idx = amb(_.range(draft.zones[zone].length + 1));
      draft.zones[zone].splice(idx, 0, field);
    });
    return d
      .closest(candidates)
      .withBranchTransition(150)
      .withFloating({ ghost: { opacity: 0.3 } });
  };

  // ## Table geometry

  const rowTuples = tuplesFor(rowDims);
  const colTuples = tuplesFor(colDims);
  const showMeasureRow = measures.length > 1 || colDims.length === 0;
  const numRowHeaderCols = Math.max(1, rowDims.length);
  const numColHeaderRows = colDims.length + (showMeasureRow ? 1 : 0);

  const numLeafCols = colTuples.length * measures.length;
  const rowHeadersW = numRowHeaderCols * ROW_HEADER_W;
  const cellW = _.clamp(
    (CANVAS_W - rowHeadersW) / numLeafCols,
    MIN_CELL_W,
    MAX_CELL_W,
  );
  const showCellText = cellW >= MIN_TEXT_CELL_W;
  const colHeadersH = numColHeaderRows * ROW_H;

  // Per-measure maxima, for the heat coloring.
  const cellValues = new Map<string, number>();
  const measureMax: { [M in CellMeasure]?: number } = {};
  rowTuples.forEach((rt) =>
    colTuples.forEach((ct) =>
      measures.forEach((m) => {
        const v = aggregate(rowDims, rt, colDims, ct, m);
        cellValues.set(`${groupId(rowDims, rt, colDims, ct)}-${m}`, v);
        measureMax[m] = Math.max(measureMax[m] ?? 0, v);
      }),
    ),
  );

  // Header cells at each level, with their span.
  const headerCells = (dims: Dimension[], tuples: Tuple[]) => {
    const cells: {
      level: number;
      id: string;
      label: string;
      start: number;
      span: number;
    }[] = [];
    dims.forEach((_dim, level) => {
      let start = 0;
      while (start < tuples.length) {
        const prefix = tuples[start].slice(0, level + 1);
        let end = start;
        while (
          end < tuples.length &&
          _.isEqual(tuples[end].slice(0, level + 1), prefix)
        ) {
          end++;
        }
        cells.push({
          level,
          id: pathId(dims.slice(0, level + 1), prefix),
          label: prefix[level],
          start,
          span: end - start,
        });
        start = end;
      }
    });
    return cells;
  };

  const rowHeaderCells = headerCells(rowDims, rowTuples);
  const colHeaderCells = headerCells(colDims, colTuples);

  const headerFill = (level: number) =>
    level === 0 ? "#e5e7eb" : level === 1 ? "#eef0f3" : "#f5f6f8";

  return (
    <g>
      {/* ## Zones */}
      {ZONE_ORDER.map((zone) => (
        <g id={`zone-${zone}`} transform={translate(zoneXs[zone]!, 0)}>
          <text x={0} y={ZONE_LABEL_Y} fontSize={11} fill="#6b7280">
            {ZONE_LABELS[zone]}
          </text>
          <rect
            x={0}
            y={ZONE_BOX_Y}
            width={zoneWidths[zone]}
            height={ZONE_BOX_H}
            rx={5}
            fill={zone === "unused" ? "#fafafa" : "#f3f4f6"}
            stroke="#d1d5db"
            strokeDasharray={zone === "unused" ? "3 3" : undefined}
          />
        </g>
      ))}

      {/* ## Chips */}
      {ZONE_ORDER.map((zone) =>
        state.zones[zone].map((field, i) => {
          const isDragged = draggedId === `chip-${field}`;
          const { fill, stroke } = chipColors(field);
          return (
            <g
              id={`chip-${field}`}
              transform={translate(
                zoneXs[zone]! + ZONE_PAD + i * (CHIP_W + CHIP_GAP),
                ZONE_BOX_Y + ZONE_PAD,
              )}
              dragologyZIndex={isDragged ? "/1" : 1}
              dragologyOnDrag={() => chipSpec(field)}
              style={{ cursor: "grab" }}
            >
              <rect
                x={0}
                y={0}
                width={CHIP_W}
                height={CHIP_H}
                rx={11}
                fill={fill}
                stroke={stroke}
                strokeWidth={isDragged ? 2 : 1}
              />
              <text
                x={CHIP_W / 2}
                y={CHIP_H / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fill="#1f2937"
              >
                {field}
              </text>
            </g>
          );
        }),
      )}

      {/* ## Table */}
      <g transform={translate(0, TABLE_Y)}>
        {/* Corner: names of the row fields */}
        <g id="corner">
          <rect
            x={0}
            y={0}
            width={rowHeadersW}
            height={colHeadersH}
            fill="#f9fafb"
            stroke="#d1d5db"
          />
        </g>
        {rowDims.map((dim, i) => (
          <g
            id={`corner-${dim}`}
            transform={translate(i * ROW_HEADER_W, colHeadersH - ROW_H)}
          >
            <text
              x={6}
              y={ROW_H / 2}
              dominantBaseline="central"
              fontSize={10}
              fontStyle="italic"
              fill="#6b7280"
            >
              {dim}
            </text>
          </g>
        ))}

        {/* Column headers (dimension levels) */}
        {colHeaderCells.map((hc) => {
          const w = hc.span * measures.length * cellW;
          return (
            <g
              id={`ch-${hc.id}`}
              transform={translate(
                rowHeadersW + hc.start * measures.length * cellW,
                hc.level * ROW_H,
              )}
            >
              <rect
                x={0}
                y={0}
                width={w}
                height={ROW_H}
                fill={headerFill(hc.level)}
                stroke="#d1d5db"
              />
              {w >= MIN_TEXT_CELL_W && (
                <text
                  x={w / 2}
                  y={ROW_H / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={10}
                  fontWeight="bold"
                  fill="#374151"
                >
                  {hc.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Column headers (measure level) */}
        {showMeasureRow &&
          colTuples.map((ct, ci) =>
            measures.map((m, mi) => (
              <g
                id={`ch-${pathId(colDims, ct)}-m-${m}`}
                transform={translate(
                  rowHeadersW + (ci * measures.length + mi) * cellW,
                  colDims.length * ROW_H,
                )}
              >
                <rect
                  x={0}
                  y={0}
                  width={cellW}
                  height={ROW_H}
                  fill={headerFill(colDims.length)}
                  stroke="#d1d5db"
                />
                {showCellText && (
                  <text
                    x={cellW / 2}
                    y={ROW_H / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={10}
                    fontStyle={m === "count" ? "italic" : undefined}
                    fill="#374151"
                  >
                    {m}
                  </text>
                )}
              </g>
            )),
          )}

        {/* Row headers */}
        {rowDims.length === 0 && (
          <g id="rh-all" transform={translate(0, colHeadersH)}>
            <rect
              x={0}
              y={0}
              width={ROW_HEADER_W}
              height={ROW_H}
              fill="#e5e7eb"
              stroke="#d1d5db"
            />
            <text
              x={6}
              y={ROW_H / 2}
              dominantBaseline="central"
              fontSize={10}
              fontWeight="bold"
              fill="#374151"
            >
              All
            </text>
          </g>
        )}
        {rowHeaderCells.map((hc) => (
          <g
            id={`rh-${hc.id}`}
            transform={translate(
              hc.level * ROW_HEADER_W,
              colHeadersH + hc.start * ROW_H,
            )}
          >
            <rect
              x={0}
              y={0}
              width={ROW_HEADER_W}
              height={hc.span * ROW_H}
              fill={headerFill(hc.level)}
              stroke="#d1d5db"
            />
            <text
              x={6}
              y={ROW_H / 2}
              dominantBaseline="central"
              fontSize={10}
              fontWeight="bold"
              fill="#374151"
            >
              {hc.label}
            </text>
          </g>
        ))}

        {/* Cells */}
        {rowTuples.map((rt, ri) =>
          colTuples.map((ct, ci) =>
            measures.map((m, mi) => {
              const gid = groupId(rowDims, rt, colDims, ct);
              const v = cellValues.get(`${gid}-${m}`)!;
              const t = measureMax[m] ? v / measureMax[m]! : 0;
              return (
                <g
                  id={`cell-${gid}-${m}`}
                  transform={translate(
                    rowHeadersW + (ci * measures.length + mi) * cellW,
                    colHeadersH + ri * ROW_H,
                  )}
                >
                  <rect
                    x={0}
                    y={0}
                    width={cellW}
                    height={ROW_H}
                    fill={heat(m, t)}
                    stroke="#e5e7eb"
                  />
                  {showCellText && (
                    <text
                      x={cellW - 5}
                      y={ROW_H / 2}
                      textAnchor="end"
                      dominantBaseline="central"
                      fontSize={10}
                      fill="#1f2937"
                    >
                      {v.toLocaleString()}
                    </text>
                  )}
                </g>
              );
            }),
          ),
        )}
      </g>
    </g>
  );
};

export default demo(
  () => (
    <div>
      <DemoNotes>
        A pivot table. Drag field chips between <i>Rows</i>, <i>Columns</i>,{" "}
        <i>Values</i>, and the unused <i>Fields</i> pool, or reorder them within
        a zone. The table re-pivots live as a preview. Cells are keyed by their
        group (which dimension values they aggregate), so a cell keeps its
        identity — and glides to its new spot — when a dimension moves between
        Rows and Columns.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={CANVAS_W}
        height={CANVAS_H}
      />
    </div>
  ),
  {
    tags: [
      "d.closest",
      "spec.withFloating [ghost]",
      "spec.withBranchTransition",
      "reordering",
    ],
  },
);
