import { produce } from "immer";
import _ from "lodash";
import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { rotateDeg, translate } from "../svgx/helpers";
import { makeId } from "../utils";

// --- Shape geometry ---

// can extend this to new shapes if we want?
type ShapeKind = { n: number };

const SIDE = 50;

function shapeVertices({ n }: ShapeKind): Vec2[] {
  // Circumradius from side length
  const R = SIDE / (2 * Math.sin(Math.PI / n));
  // Offset so the bottom edge is flat
  return Array.from({ length: n }, (_, i) =>
    Vec2.polarDeg(R, (360 * (i - 0.5)) / n + 90),
  );
}

function shapePoints(kind: ShapeKind): string {
  return shapeVertices(kind)
    .map((v) => v.str(" "))
    .join(" ");
}

// --- Edge representation for snapping ---

type Edge = { a: Vec2; b: Vec2 };

/** Get edges of a shape in world space (after position + rotation) */
function worldEdges(kind: ShapeKind, pos: Vec2, rotDeg: number): Edge[] {
  const verts = shapeVertices(kind).map((v) => v.rotateDeg(rotDeg).add(pos));
  return verts.map((v, i) => ({ a: v, b: verts[(i + 1) % verts.length] }));
}

function edgeMidpoint(e: Edge): Vec2 {
  return e.a.mid(e.b);
}

function edgeLength(e: Edge): number {
  return e.a.dist(e.b);
}

function edgeDir(e: Edge): Vec2 {
  return e.b.sub(e.a).norm();
}

// --- Snap computation ---

type Snap = {
  pos: Vec2;
  rotDeg: number;
};

const OVERLAP_EPSILON = 2; // pixels of overlap tolerance for tessellation

/**
 * Check if a shape at a given pos/rot overlaps any existing shape.
 * Uses a simple center-distance check against all vertices.
 */
function overlapsAny(
  kind: ShapeKind,
  pos: Vec2,
  rotDeg: number,
  shapes: Shape[],
  excludeId?: string,
): boolean {
  const newVerts = shapeVertices(kind).map((v) => v.rotateDeg(rotDeg).add(pos));
  for (const s of shapes) {
    if (s.id === excludeId) continue;
    const existingVerts = shapeVertices(s.kind).map((v) =>
      v.rotateDeg(s.rotDeg).add(Vec2(s.x, s.y)),
    );
    // SAT-lite: check if polygons overlap using vertex-in-polygon
    if (polygonsOverlap(newVerts, existingVerts, OVERLAP_EPSILON)) return true;
  }
  return false;
}

/** Rough overlap check: do any vertices of A lie well inside B or vice versa? */
function polygonsOverlap(
  vertsA: Vec2[],
  vertsB: Vec2[],
  epsilon: number,
): boolean {
  // Use separating axis theorem for convex polygons
  const axes = [...getAxes(vertsA), ...getAxes(vertsB)];
  for (const axis of axes) {
    const [minA, maxA] = project(vertsA, axis);
    const [minB, maxB] = project(vertsB, axis);
    // If there's a gap (accounting for epsilon), no overlap on this axis
    if (maxA - epsilon <= minB || maxB - epsilon <= minA) return false;
  }
  return true;
}

function getAxes(verts: Vec2[]): Vec2[] {
  return verts.map((v, i) => {
    const next = verts[(i + 1) % verts.length];
    const edge = next.sub(v);
    return Vec2(-edge.y, edge.x).norm(); // perpendicular
  });
}

function project(verts: Vec2[], axis: Vec2): [number, number] {
  const dots = verts.map((v) => v.dot(axis));
  return [Math.min(...dots), Math.max(...dots)];
}

/**
 * Compute all valid edge-to-edge snaps for placing `kind` against
 * existing shapes. Two edges snap when they share the same length
 * and can be aligned flush (reversed direction).
 */
function computeSnaps(
  kind: ShapeKind,
  shapes: Shape[],
  excludeId?: string,
): Snap[] {
  const snaps: Snap[] = [];
  const newEdgesAtZero = worldEdges(kind, Vec2(0), 0);

  for (const s of shapes) {
    if (s.id === excludeId) continue;
    const existingEdges = worldEdges(s.kind, Vec2(s.x, s.y), s.rotDeg);

    for (const existingEdge of existingEdges) {
      const eLen = edgeLength(existingEdge);
      const existDir = edgeDir(existingEdge);
      const targetDir = existDir.mul(-1);
      const targetAngleRad = targetDir.angleRad();

      // Pick the new edge closest in angle (least rotation needed)
      const compatible = newEdgesAtZero.filter(
        (e) => Math.abs(edgeLength(e) - eLen) <= 0.1,
      );
      if (compatible.length === 0) continue;

      const normalizeAngle = (r: number) => {
        r = ((r + Math.PI) % (2 * Math.PI)) - Math.PI;
        return r < -Math.PI ? r + 2 * Math.PI : r;
      };
      const rotRadFor = (e: Edge) =>
        normalizeAngle(targetAngleRad - edgeDir(e).angleRad());

      const bestNewEdge = _.minBy(compatible, (e) => Math.abs(rotRadFor(e)))!;
      const bestRotRad = rotRadFor(bestNewEdge);
      const rotDeg = (bestRotRad * 180) / Math.PI;

      // After rotating the new shape, compute where its center needs to be
      // so that the new edge's midpoint matches the existing edge's midpoint
      const newEdgeRotated = {
        a: bestNewEdge.a.rotateRad(bestRotRad),
        b: bestNewEdge.b.rotateRad(bestRotRad),
      };
      const newMid = edgeMidpoint(newEdgeRotated);
      const existMid = edgeMidpoint(existingEdge);
      const pos = existMid.sub(newMid);

      // Normalize rotation to [0, 360)
      const normRot = ((rotDeg % 360) + 360) % 360;

      // Check it doesn't overlap existing shapes
      if (!overlapsAny(kind, pos, normRot, shapes, excludeId)) {
        snaps.push({ pos, rotDeg: normRot });
      }
    }
  }

  return snaps;
}

// --- State ---

type Shape = {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  rotDeg: number;
};

export type State = {
  shapes: Shape[];
};

// Palette items (in palette space, not on canvas)
const PALETTE_BASELINE = 135;
const PALETTE_ITEMS = [
  { kind: { n: 3 }, x: 50 },
  { kind: { n: 4 }, x: 140 },
  { kind: { n: 6 }, x: 245 },
  { kind: { n: 8 }, x: 370 },
].map((item) => {
  const bottom = Math.max(...shapeVertices(item.kind).map((v) => v.y));
  return { ...item, y: PALETTE_BASELINE - bottom };
});

const initialState: State = { shapes: [] };

// --- Palette rendering ---

const PALETTE_W = 480;
const PALETTE_H = 150;

function getFillColor(kind: ShapeKind) {
  return {
    3: "#fca5a5",
    4: "#93c5fd",
    6: "#86efac",
    8: "#fde68a",
  }[kind.n];
}

function getStrokeColor(kind: ShapeKind) {
  return {
    3: "#ef4444",
    4: "#3b82f6",
    6: "#16a34a",
    8: "#ca8a04",
  }[kind.n];
}

// --- The draggable ---

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  return (
    <g>
      {/* Canvas shapes */}
      {state.shapes.map((shape, i) => {
        const isDragged = draggedId === `shape-${shape.id}`;

        return (
          <polygon
            id={`shape-${shape.id}`}
            transform={translate(shape.x, shape.y) + rotateDeg(shape.rotDeg)}
            dragologyZIndex={isDragged ? 10 : 1}
            points={shapePoints(shape.kind)}
            fill={getFillColor(shape.kind)}
            stroke={getStrokeColor(shape.kind)}
            strokeWidth={2}
            dragologyOnDrag={() => {
              const snaps = computeSnaps(shape.kind, state.shapes, shape.id);

              const snapStates = snaps.map((snap) =>
                produce(state, (draft) => {
                  draft.shapes[i].x = snap.pos.x;
                  draft.shapes[i].y = snap.pos.y;
                  draft.shapes[i].rotDeg = snap.rotDeg;
                }),
              );

              const stateWithout = produce(state, (draft) => {
                draft.shapes.splice(i, 1);
              });

              return d
                .closest([snapStates, d.dropTarget("trash-bin", stateWithout)])
                .whenFar(
                  d.vary(state, [
                    param("shapes", i, "x"),
                    param("shapes", i, "y"),
                  ]),
                  { gap: 30 },
                )
                .withInitContext({ anchorPos: Vec2(0) });
            }}
          />
        );
      })}

      {/* Trash bin */}
      <g id="trash-bin" transform={translate(540, 10)}>
        <rect
          width={50}
          height={50}
          fill="#fee"
          stroke="#999"
          strokeWidth={2}
          strokeDasharray="4,4"
          rx={4}
        />
        <text
          x={25}
          y={25}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={28}
          pointerEvents="none"
        >
          {"\u{1F5D1}"}
        </text>
      </g>

      {/* Palette background */}
      <g>
        <rect
          width={PALETTE_W}
          height={PALETTE_H}
          fill="#f9fafb"
          stroke="#e5e7eb"
        />
        <line
          x1={0}
          y1={PALETTE_H}
          x2={PALETTE_W}
          y2={PALETTE_H}
          stroke="#e5e7eb"
        />
        <text x={10} y={14} fontSize={9} fill="#aaa" fontWeight="500">
          DRAG TO ADD
        </text>
      </g>

      {/* Palette items */}
      {PALETTE_ITEMS.map((item) => (
        <polygon
          transform={translate(item.x, item.y)}
          points={shapePoints(item.kind)}
          fill={getFillColor(item.kind)}
          stroke={getStrokeColor(item.kind)}
          strokeWidth={2}
          opacity={0.8}
          dragologyOnDrag={() => {
            const newId = makeId();
            const stateWithNew = produce(state, (draft) => {
              draft.shapes.push({
                id: newId,
                kind: item.kind,
                x: 0,
                y: 0,
                rotDeg: 0,
              });
            });
            return d.switchToStateAndFollow(stateWithNew, `shape-${newId}`);
          }}
        />
      ))}
    </g>
  );
};

export { draggable };

export default demo(
  () => (
    <div>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={600}
        height={450}
      />
    </div>
  ),
  {
    tags: [
      "math",
      "d.closest",
      "d.vary",
      "d.switchToStateAndFollow",
      "spec.whenFar",
      "discrete on top of continuous",
      "d.dropTarget",
      "spec.withInitContext [anchorPos]",
    ],
  },
);
