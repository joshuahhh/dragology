import { useEffect, useRef, useState } from "react";
import { DragFrame, dragSpecToBehavior } from "./DragBehavior";
import { DragStatus } from "./DraggableRenderer";
import { Vec2 } from "./math/vec2";

// # Types

export type DropZoneData = {
  regions: { activePath: string; svgPath: string; color: string }[];
  colorMap: Map<string, string>;
};

// # Colors

const REGION_COLORS = [
  "rgb(65, 105, 225)", // royal blue
  "rgb(220, 20, 60)", // crimson
  "rgb(34, 139, 34)", // forest green
  "rgb(255, 165, 0)", // orange
  "rgb(138, 43, 226)", // blue violet
  "rgb(0, 206, 209)", // dark turquoise
  "rgb(255, 215, 0)", // gold
  "rgb(199, 21, 133)", // medium violet red
  "rgb(70, 130, 180)", // steel blue
  "rgb(210, 105, 30)", // chocolate
];

function assignColors(paths: string[]): Map<string, string> {
  const sorted = [...new Set(paths)].sort();
  const map = new Map<string, string>();
  for (let i = 0; i < sorted.length; i++) {
    map.set(sorted[i], REGION_COLORS[i % REGION_COLORS.length]);
  }
  return map;
}

// # Grid constants

const FINE_CELL = 8;
const COARSE_FACTOR = 4; // coarse = 32px

// # Marching squares

// Lookup table: for each of the 16 cases, list of [entryEdge, exitEdge] segments.
// Edges: 0=top, 1=right, 2=bottom, 3=left.
// Corner bits: TL=8, TR=4, BR=2, BL=1.
const MS_SEGMENTS: [number, number][][] = [
  [], // 0:  0000
  [[3, 2]], // 1:  0001
  [[2, 1]], // 2:  0010
  [[3, 1]], // 3:  0011
  [[1, 0]], // 4:  0100
  [
    [3, 0],
    [1, 2],
  ], // 5:  0101 (saddle)
  [[2, 0]], // 6:  0110
  [[3, 0]], // 7:  0111
  [[0, 3]], // 8:  1000
  [[0, 2]], // 9:  1001
  [
    [0, 1],
    [2, 3],
  ], // 10: 1010 (saddle)
  [[0, 1]], // 11: 1011
  [[1, 3]], // 12: 1100
  [[1, 2]], // 13: 1101
  [[2, 3]], // 14: 1110
  [], // 15: 1111
];

// For contour tracing: given a case and the edge we entered through,
// what edge do we exit through?
function buildExitMap(): Map<number, Map<number, number>> {
  const map = new Map<number, Map<number, number>>();
  for (let c = 0; c < 16; c++) {
    const m = new Map<number, number>();
    for (const [from, to] of MS_SEGMENTS[c]) {
      m.set(from, to);
      m.set(to, from);
    }
    map.set(c, m);
  }
  return map;
}

const EXIT_MAP = buildExitMap();

function edgeMidpoint(
  col: number,
  row: number,
  edge: number,
  cellSize: number,
): Vec2 {
  const x = col * cellSize;
  const y = row * cellSize;
  switch (edge) {
    case 0:
      return Vec2(x + cellSize / 2, y);
    case 1:
      return Vec2(x + cellSize, y + cellSize / 2);
    case 2:
      return Vec2(x + cellSize / 2, y + cellSize);
    case 3:
      return Vec2(x, y + cellSize / 2);
    default:
      throw new Error("invalid edge");
  }
}

// Neighbor cell when exiting through an edge.
// Returns [col, row, entryEdge] of the neighbor, or null if at grid boundary.
function neighbor(
  col: number,
  row: number,
  exitEdge: number,
  minCol: number,
  maxCol: number,
  minRow: number,
  maxRow: number,
): [number, number, number] | null {
  switch (exitEdge) {
    case 0:
      return row - 1 >= minRow ? [col, row - 1, 2] : null;
    case 1:
      return col + 1 < maxCol ? [col + 1, row, 3] : null;
    case 2:
      return row + 1 < maxRow ? [col, row + 1, 0] : null;
    case 3:
      return col - 1 >= minCol ? [col - 1, row, 1] : null;
    default:
      return null;
  }
}

/**
 * Trace closed contour polygons for a single region using marching squares.
 *
 * Operates on a vertex grid of (fineRows+1)×(fineCols+1) values.
 * Iterates over cells from (-1,-1) to (fineCols, fineRows) so that
 * regions touching the SVG boundary produce closed contours (out-of-bounds
 * vertices are treated as "not this region").
 */
function traceContours(
  vertices: string[],
  fineCols: number,
  fineRows: number,
  cellSize: number,
  region: string,
): Vec2[][] {
  const vi = (r: number, c: number) => r * (fineCols + 1) + c;

  function isInside(r: number, c: number): boolean {
    if (r < 0 || r > fineRows || c < 0 || c > fineCols) return false;
    return vertices[vi(r, c)] === region;
  }

  function cornerValue(r: number, c: number): string {
    if (r < 0 || r > fineRows || c < 0 || c > fineCols) return "";
    return vertices[vi(r, c)];
  }

  // Detect cells where 3+ distinct regions meet. In these cells, straight
  // edge-midpoint-to-edge-midpoint lines leave small uncovered triangles.
  // Routing through the cell center makes all regions meet at one point.
  function isMultiLabel(cellRow: number, cellCol: number): boolean {
    const vals = new Set<string>();
    vals.add(cornerValue(cellRow, cellCol));
    vals.add(cornerValue(cellRow, cellCol + 1));
    vals.add(cornerValue(cellRow + 1, cellCol + 1));
    vals.add(cornerValue(cellRow + 1, cellCol));
    return vals.size >= 3;
  }

  function caseAt(cellRow: number, cellCol: number): number {
    const tl = isInside(cellRow, cellCol) ? 8 : 0;
    const tr = isInside(cellRow, cellCol + 1) ? 4 : 0;
    const br = isInside(cellRow + 1, cellCol + 1) ? 2 : 0;
    const bl = isInside(cellRow + 1, cellCol) ? 1 : 0;
    return tl | tr | br | bl;
  }

  // Track traced edges to avoid duplicates. Key: "col,row,edge"
  const traced = new Set<string>();
  const ek = (c: number, r: number, e: number) => `${c},${r},${e}`;

  const minCol = -1,
    maxCol = fineCols + 1,
    minRow = -1,
    maxRow = fineRows + 1;

  const polygons: Vec2[][] = [];

  for (let r = minRow; r < maxRow; r++) {
    for (let c = minCol; c < maxCol; c++) {
      const ci = caseAt(r, c);
      if (ci === 0 || ci === 15) continue;

      for (const [entryEdge] of MS_SEGMENTS[ci]) {
        if (traced.has(ek(c, r, entryEdge))) continue;

        const polygon: Vec2[] = [];
        let curCol = c,
          curRow = r,
          curEntry = entryEdge;

        while (true) {
          const curCase = caseAt(curRow, curCol);
          const curExits = EXIT_MAP.get(curCase)!;
          const exitEdge = curExits.get(curEntry);
          if (exitEdge === undefined) break;

          traced.add(ek(curCol, curRow, curEntry));

          // For multi-label cells (3+ regions), route through center so
          // adjacent regions meet at a point instead of leaving a gap.
          // Skip for saddle cases (5, 10) which have two segments per cell.
          if (isMultiLabel(curRow, curCol) && curCase !== 5 && curCase !== 10) {
            polygon.push(
              Vec2((curCol + 0.5) * cellSize, (curRow + 0.5) * cellSize),
            );
          }

          polygon.push(edgeMidpoint(curCol, curRow, exitEdge, cellSize));

          const nb = neighbor(
            curCol,
            curRow,
            exitEdge,
            minCol,
            maxCol,
            minRow,
            maxRow,
          );
          if (!nb) break;

          const [nc, nr, ne] = nb;
          // Check if we've returned to the start
          if (nc === c && nr === r && ne === entryEdge) break;
          curCol = nc;
          curRow = nr;
          curEntry = ne;
        }

        if (polygon.length >= 3) {
          polygons.push(polygon);
        }
      }
    }
  }

  return polygons;
}

// # Smoothing (Chaikin's corner-cutting)

function smoothPolygon(points: Vec2[], iterations: number = 2): Vec2[] {
  let current = points;
  for (let iter = 0; iter < iterations; iter++) {
    const next: Vec2[] = [];
    for (let i = 0; i < current.length; i++) {
      const p0 = current[i];
      const p1 = current[(i + 1) % current.length];
      next.push(Vec2(0.75 * p0.x + 0.25 * p1.x, 0.75 * p0.y + 0.25 * p1.y));
      next.push(Vec2(0.25 * p0.x + 0.75 * p1.x, 0.25 * p0.y + 0.75 * p1.y));
    }
    current = next;
  }
  return current;
}

function polygonToSvgPath(points: Vec2[]): string {
  if (points.length === 0) return "";
  const parts = [`M${points[0].x},${points[0].y}`];
  for (let i = 1; i < points.length; i++) {
    parts.push(`L${points[i].x},${points[i].y}`);
  }
  parts.push("Z");
  return parts.join("");
}

// # Drop zones SVG component

export function DropZonesSvg({
  data,
  width,
  height,
}: {
  data: DropZoneData;
  width: number;
  height: number;
}) {
  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g opacity={0.35}>
        {data.regions.map((r, i) => (
          <path key={i} d={r.svgPath} fill={r.color} fillRule="evenodd" />
        ))}
      </g>
    </svg>
  );
}

// # Legend component

export function DropZoneLegend({ data }: { data: DropZoneData }) {
  const entries = [...data.colorMap.entries()];
  return (
    <div
      style={{
        fontSize: "0.75rem",
        fontFamily: "monospace",
        display: "flex",
        flexWrap: "wrap",
        columnGap: 16,
        rowGap: 4,
      }}
    >
      {entries.map(([path, color]) => (
        <div
          key={path}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              backgroundColor: color,
              opacity: 0.6,
              flexShrink: 0,
            }}
          />
          <span style={{ color: "rgb(71, 85, 105)" }}>{path}</span>
        </div>
      ))}
    </div>
  );
}

// # Cooperative drop zone generator
//
// Yields periodically so the main thread stays responsive during computation.
// Uses a time budget: checks performance.now() every few samples and yields
// when the chunk has exceeded CHUNK_BUDGET_MS.

const CHUNK_BUDGET_MS = 8;
const CHECK_EVERY = 4;

function* computeDropZones(
  sample: (x: number, y: number) => string,
  width: number,
  height: number,
): Generator<void, DropZoneData, void> {
  let chunkStart = performance.now();
  let sinceCheck = 0;

  function* maybePause() {
    if (++sinceCheck >= CHECK_EVERY) {
      sinceCheck = 0;
      if (performance.now() - chunkStart >= CHUNK_BUDGET_MS) {
        yield;
        chunkStart = performance.now();
      }
    }
  }

  const fineCols = Math.ceil(width / FINE_CELL);
  const fineRows = Math.ceil(height / FINE_CELL);
  const coarseCols = Math.ceil(fineCols / COARSE_FACTOR);
  const coarseRows = Math.ceil(fineRows / COARSE_FACTOR);

  const totalV = (fineRows + 1) * (fineCols + 1);
  const vertices: string[] = new Array(totalV).fill("");
  const needsFine: boolean[] = new Array(totalV).fill(false);
  const vi = (r: number, c: number) => r * (fineCols + 1) + c;

  // --- Phase 1: Coarse sampling ---
  for (let cr = 0; cr <= coarseRows; cr++) {
    const fr = Math.min(cr * COARSE_FACTOR, fineRows);
    for (let cc = 0; cc <= coarseCols; cc++) {
      const fc = Math.min(cc * COARSE_FACTOR, fineCols);
      vertices[vi(fr, fc)] = sample(fc * FINE_CELL, fr * FINE_CELL);
      yield* maybePause();
    }
  }

  // --- Phase 2: Analyze coarse cells ---
  const mixed = new Set<number>();
  for (let cr = 0; cr < coarseRows; cr++) {
    for (let cc = 0; cc < coarseCols; cc++) {
      const fr0 = cr * COARSE_FACTOR;
      const fc0 = cc * COARSE_FACTOR;
      const fr1 = Math.min((cr + 1) * COARSE_FACTOR, fineRows);
      const fc1 = Math.min((cc + 1) * COARSE_FACTOR, fineCols);

      const tl = vertices[vi(fr0, fc0)];
      const tr = vertices[vi(fr0, fc1)];
      const bl = vertices[vi(fr1, fc0)];
      const br = vertices[vi(fr1, fc1)];

      if (tl === tr && tr === bl && bl === br) {
        for (let fr = fr0; fr <= fr1; fr++)
          for (let fc = fc0; fc <= fc1; fc++) vertices[vi(fr, fc)] = tl;
      } else {
        mixed.add(cr * coarseCols + cc);
      }
    }
  }

  for (const key of mixed) {
    const cr = Math.floor(key / coarseCols);
    const cc = key % coarseCols;
    const fr0 = cr * COARSE_FACTOR;
    const fc0 = cc * COARSE_FACTOR;
    const fr1 = Math.min((cr + 1) * COARSE_FACTOR, fineRows);
    const fc1 = Math.min((cc + 1) * COARSE_FACTOR, fineCols);

    for (let fr = fr0; fr <= fr1; fr++)
      for (let fc = fc0; fc <= fc1; fc++) needsFine[vi(fr, fc)] = true;
  }

  yield;
  chunkStart = performance.now();

  // --- Phase 3: Fine sampling ---
  for (let fr = 0; fr <= fineRows; fr++) {
    for (let fc = 0; fc <= fineCols; fc++) {
      if (needsFine[vi(fr, fc)]) {
        vertices[vi(fr, fc)] = sample(fc * FINE_CELL, fr * FINE_CELL);
        yield* maybePause();
      }
    }
  }

  // --- Phase 4: Contour tracing + smoothing ---
  const pathSet = new Set<string>();
  for (const v of vertices) {
    if (v) pathSet.add(v);
  }

  const colorMap = assignColors([...pathSet]);

  // TODO: Special case - If there's exactly one bg zone, make it
  // pale gray. Match "bg" as any path segment (e.g. "bg/...",
  // "with-floating/bg/...").
  const isBgPath = (p: string) => p.split("/").includes("bg");
  const bgPaths = [...pathSet].filter(isBgPath);
  if (bgPaths.length === 1) {
    colorMap.set(bgPaths[0], "rgb(180, 180, 180)");
  }

  const regions: { activePath: string; svgPath: string; color: string }[] = [];
  for (const path of pathSet) {
    const polygons = traceContours(
      vertices,
      fineCols,
      fineRows,
      FINE_CELL,
      path,
    );
    if (polygons.length === 0) continue;
    const smoothed = polygons.map((p) => smoothPolygon(p));
    const svgPath = smoothed.map(polygonToSvgPath).join(" ");
    regions.push({ activePath: path, color: colorMap.get(path)!, svgPath });
    yield;
    chunkStart = performance.now();
  }

  return { regions, colorMap };
}

// # Hook: drives the generator cooperatively

export function useDropZoneData<T extends object>(
  status: (DragStatus<T> & { type: "dragging" }) | null,
  width: number,
  height: number,
): { data: DropZoneData | null; computing: boolean } {
  const { specForDropZoneVis: spec, behaviorCtx } = status ?? {};

  const [data, setData] = useState<DropZoneData | null>(null);
  const [computing, setComputing] = useState(false);
  const specRef = useRef(spec);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!spec || !behaviorCtx) {
      setData(null);
      setComputing(false);
      return;
    }

    // Only recompute when spec identity changes (new drag)
    if (spec === specRef.current && dataRef.current !== null) return;
    specRef.current = spec;

    setComputing(true);

    // Create a separate behavior instance for sampling (doesn't interfere
    // with the drag's own behavior's mutable curParams).
    const samplingBehavior = dragSpecToBehavior(spec, behaviorCtx);

    // TODO: If the behavior has some kind of memory, that memory
    // will be shared through the sampling process, leading to weird
    // results here! However, recreating the behavior on every sample
    // can be costly, so we don't do that (yet).

    function sample(x: number, y: number): string {
      const frame: DragFrame = { pointer: Vec2(x, y) };
      try {
        return samplingBehavior(frame).activePath;
      } catch {
        return "error";
      }
    }

    const gen = computeDropZones(sample, width, height);
    let cancelled = false;

    function step() {
      if (cancelled) return;
      const result = gen.next();
      if (result.done) {
        setData(result.value);
        setComputing(false);
      } else {
        setTimeout(step, 0);
      }
    }

    step();

    return () => {
      cancelled = true;
      setComputing(false);
    };
  }, [spec, behaviorCtx, width, height]);

  return { data, computing };
}
