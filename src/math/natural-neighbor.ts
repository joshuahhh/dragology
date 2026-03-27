/**
 * Natural neighbor (Sibson) interpolation on top of d3-delaunay.
 *
 * Ported from Tinfour's NaturalNeighborInterpolator (Apache 2.0).
 * Algorithm reference: https://gwlucastrig.github.io/TinfourDocs/NaturalNeighborTinfourAlgorithm/index.html
 *
 * Given a Delaunay triangulation and a query point inside the convex hull,
 * computes weights (λ_i) for each natural neighbor such that Σλ_i = 1.
 * The weights represent the proportion of Voronoi area each neighbor would
 * "yield" if the query point were inserted into the triangulation.
 */

import { Delaunay } from "./delaunay";
import { Vec2 } from "./vec2";

export type NaturalNeighborResult = {
  /** Index into the original points array → weight. */
  weights: Map<number, number>;
  /** Barycentric coordinate deviation (diagnostic — should be near zero). */
  barycentricDeviation: number;
};

// --- Halfedge navigation helpers for delaunator ---

function nextHe(e: number): number {
  return e % 3 === 2 ? e - 2 : e + 1;
}

/**
 * Compute natural neighbor (Sibson) weights for a query point.
 *
 * Returns null if the query point is outside the convex hull.
 * Returns a single-entry weights map if query is on top of an existing vertex.
 */
export function naturalNeighborWeights(
  inputPoints: Vec2[],
  query: Vec2,
  opts?: { projectOutside?: boolean; coincidenceTolerance2?: number },
): NaturalNeighborResult | null {
  if (inputPoints.length < 3) return null;
  const delaunay = new Delaunay(inputPoints);
  return naturalNeighborWeightsFromDelaunay(delaunay, query, opts);
}

/**
 * Same as naturalNeighborWeights but accepts a pre-built Delaunay instance.
 */
export function naturalNeighborWeightsFromDelaunay(
  delaunay: Delaunay,
  query: Vec2,
  opts?: { projectOutside?: boolean; coincidenceTolerance2?: number },
): NaturalNeighborResult | null {
  const coincidenceTolerance2 = opts?.coincidenceTolerance2 ?? 1e-20;
  const projectOutside = opts?.projectOutside ?? false;
  const d3 = delaunay.d3;
  const points = d3.points as Float64Array;
  const { triangles, halfedges } = d3;
  let qx = query.x;
  let qy = query.y;

  // Check coincidence with nearest vertex.
  const nearest = d3.find(qx, qy);
  const dx = points[2 * nearest] - qx;
  const dy = points[2 * nearest + 1] - qy;
  if (dx * dx + dy * dy < coincidenceTolerance2) {
    const weights = new Map<number, number>();
    weights.set(nearest, 1);
    return { weights, barycentricDeviation: 0 };
  }

  // Check if query lies on a hull edge. If so, Sibson weights degenerate to
  // linear interpolation between the two hull-edge endpoints.
  const hullEdge = findHullEdge(points, d3.hull, qx, qy);
  if (hullEdge !== null) {
    return hullEdgeWeights(points, hullEdge, qx, qy);
  }

  // Find the enclosing triangle.
  const encTri = delaunay.findTriangle(Vec2(qx, qy));
  if (encTri === -1) {
    if (!projectOutside) return null;

    // Project onto the nearest point on the convex hull boundary.
    const proj = delaunay.projectOntoConvexHull(Vec2(qx, qy));
    if (proj.type === "vertex") {
      const weights = new Map<number, number>();
      weights.set(proj.ptIdx, 1);
      return { weights, barycentricDeviation: 0 };
    }
    if (proj.type === "edge") {
      const weights = new Map<number, number>();
      weights.set(proj.ptIdx0, 1 - proj.t);
      weights.set(proj.ptIdx1, proj.t);
      return { weights, barycentricDeviation: 0 };
    }
    // type === "triangle" — shouldn't happen since findTriangle returned -1
    return null;
  }

  // Find the Bowyer-Watson cavity: all triangles whose circumcircle contains query.
  // Use >= 0 (non-strict) so points exactly on circumcircle boundaries are included.
  const nTri = triangles.length / 3;
  const inCavity = new Uint8Array(nTri);
  const stack: number[] = [encTri];
  inCavity[encTri] = 1;

  while (stack.length > 0) {
    const t = stack.pop()!;
    for (let j = 0; j < 3; j++) {
      const he = 3 * t + j;
      const opp = halfedges[he];
      if (opp === -1) continue;
      const ot = Math.floor(opp / 3);
      if (inCavity[ot]) continue;
      if (inCircumcircle(points, triangles, ot, qx, qy)) {
        inCavity[ot] = 1;
        stack.push(ot);
      }
    }
  }

  // Extract ordered boundary: cavity-side halfedges whose opposite is
  // not in the cavity (or is a hull edge).
  const boundaryEdges: number[] = [];
  for (let t = 0; t < nTri; t++) {
    if (!inCavity[t]) continue;
    for (let j = 0; j < 3; j++) {
      const he = 3 * t + j;
      const opp = halfedges[he];
      if (opp === -1 || !inCavity[Math.floor(opp / 3)]) {
        boundaryEdges.push(he);
      }
    }
  }

  if (boundaryEdges.length < 3) return null;

  // Order boundary into a cycle by chaining dst→src.
  // For cavity halfedge `he`, src = triangles[he], dst = triangles[nextHe(he)].
  const polygon = orderBoundary(boundaryEdges, triangles);
  if (polygon === null) return null;

  const nEdge = polygon.length;

  // --- Compute Sibson coordinates ---
  // All coordinates shifted so query is at origin for numerical stability.

  // Extract polygon vertex indices and shifted coordinates.
  const vertIdx: number[] = new Array(nEdge);
  const vx: number[] = new Array(nEdge);
  const vy: number[] = new Array(nEdge);
  for (let i = 0; i < nEdge; i++) {
    const vi = triangles[polygon[i]];
    vertIdx[i] = vi;
    vx[i] = points[2 * vi] - qx;
    vy[i] = points[2 * vi + 1] - qy;
  }

  const weights = new Float64Array(nEdge);
  let wSum = 0;

  // For each consecutive triple (A=i0, B=i1, C=i2) of boundary vertices,
  // compute the "stolen area" for vertex B.
  //
  // Following Tinfour's approach:
  // - wXY = area of slice of Q's new Voronoi cell adjacent to B
  // - wThiessen = area of slice of B's existing Voronoi cell in same angular range
  // - weight[B] = wXY - wThiessen (the "stolen area")

  // Cache circumcenter(A, B, Q) from the previous iteration.
  let prevC0: { x: number; y: number } | null = null;

  for (let i0 = 0; i0 < nEdge; i0++) {
    const i1 = (i0 + 1) % nEdge;
    const i2 = (i1 + 1) % nEdge;

    const ax = vx[i0],
      ay = vy[i0];
    const bx = vx[i1],
      by = vy[i1];
    const cx = vx[i2],
      cy = vy[i2];

    // Midpoints of edges A-B and B-C (shifted coords).
    const mx0 = (ax + bx) / 2;
    const my0 = (ay + by) / 2;
    const mx1 = (bx + cx) / 2;
    const my1 = (by + cy) / 2;

    // c0 = circumcenter(A, B, Q=origin), c1 = circumcenter(B, C, Q=origin).
    const c0 = prevC0 ?? circumcenter(ax, ay, bx, by, 0, 0);
    const c1 = circumcenter(bx, by, cx, cy, 0, 0);
    prevC0 = c1; // reuse as c0 of next iteration

    // wXY: shoelace area of [midAB → c0 → c1 → midBC].
    const wXY =
      mx0 * c0.y -
      c0.x * my0 +
      (c0.x * c1.y - c1.x * c0.y) +
      (c1.x * my1 - mx1 * c1.y);

    // wThiessen: shoelace area along existing Voronoi cell of B,
    // traced via circumcenters of triangles around B from edge AB to edge BC.
    //
    // Walk: start from nextHe(polygon[i0]) which is the next halfedge in
    // the cavity triangle of e0, going from B toward the 3rd vertex.
    // Walk clockwise around B (via halfedges→nextHe) until reaching polygon[i1].
    const e0 = polygon[i0];
    const e1 = polygon[i1];
    let n = nextHe(e0); // B→D in cavity triangle of e0

    // First circumcenter: the cavity triangle containing e0.
    let curCC = triCircumcenter(points, triangles, n, qx, qy);
    let wThiessen = mx0 * curCC.y - curCC.x * my0;

    // Walk around B through intermediate triangles until we reach e1.
    let safety = 0;
    while (n !== e1 && safety < 1000) {
      safety++;
      const opp = halfedges[n];
      if (opp === -1) {
        // Hit hull edge — the Voronoi cell of B is unbounded.
        // Use a point "at infinity" perpendicular to the hull edge.
        const src = triangles[n];
        const dst = triangles[nextHe(n)];
        const ex = points[2 * dst] - points[2 * src];
        const ey = points[2 * dst + 1] - points[2 * src + 1];
        // Perpendicular pointing outward (away from interior).
        // For CW-oriented triangles, (ey, -ex) points outward.
        const len = Math.sqrt(ex * ex + ey * ey);
        const scale = 1e8;
        const mx = (points[2 * src] + points[2 * dst]) / 2 - qx;
        const my = (points[2 * src + 1] + points[2 * dst + 1]) / 2 - qy;
        const infCC = {
          x: mx + (ey / len) * scale,
          y: my + (-ex / len) * scale,
        };
        wThiessen += curCC.x * infCC.y - infCC.x * curCC.y;
        curCC = infCC;

        // Now walk CCW from e1 backward until we hit the other hull edge.
        // Accumulate from that side too.
        let m = nextHe(e1);
        let endCC = triCircumcenter(points, triangles, m, qx, qy);
        let revThiessen = 0;

        let revSafety = 0;
        while (revSafety < 1000) {
          revSafety++;
          const opp2 = halfedges[m];
          if (opp2 === -1) {
            // Other hull edge — use infinity point here too.
            const src2 = triangles[m];
            const dst2 = triangles[nextHe(m)];
            const ex2 = points[2 * dst2] - points[2 * src2];
            const ey2 = points[2 * dst2 + 1] - points[2 * src2 + 1];
            const len2 = Math.sqrt(ex2 * ex2 + ey2 * ey2);
            const infCC2 = {
              x:
                (points[2 * src2] + points[2 * dst2]) / 2 -
                qx +
                (ey2 / len2) * scale,
              y:
                (points[2 * src2 + 1] + points[2 * dst2 + 1]) / 2 -
                qy +
                (-ex2 / len2) * scale,
            };
            // Close the gap: infCC → ... → infCC2
            wThiessen += curCC.x * infCC2.y - infCC2.x * curCC.y;
            curCC = endCC;
            break;
          }
          m = nextHe(opp2);
          const cc = triCircumcenter(points, triangles, m, qx, qy);
          revThiessen += endCC.x * cc.y - cc.x * endCC.y;
          endCC = cc;
        }

        wThiessen += revThiessen;
        break;
      }
      n = nextHe(opp);
      const nextCC = triCircumcenter(points, triangles, n, qx, qy);
      wThiessen += curCC.x * nextCC.y - nextCC.x * curCC.y;
      curCC = nextCC;
    }

    wThiessen += curCC.x * my1 - mx1 * curCC.y;

    // wDelta: stolen area (both computed in CW order, so negate → wXY - wThiessen).
    const wDelta = wXY - wThiessen;
    wSum += wDelta;
    weights[i1] += wDelta;
  }

  if (Math.abs(wSum) < 1e-30) return null;

  // Normalize weights.
  const result = new Map<number, number>();
  for (let i = 0; i < nEdge; i++) {
    result.set(vertIdx[i], weights[i] / wSum);
  }

  // Barycentric deviation diagnostic: recompute query coords from weights.
  let xDev = 0;
  let yDev = 0;
  for (let i = 0; i < nEdge; i++) {
    const w = weights[i] / wSum;
    xDev += w * vx[i];
    yDev += w * vy[i];
  }

  return {
    weights: result,
    barycentricDeviation: Math.sqrt(xDev * xDev + yDev * yDev),
  };
}

// --- Internal helpers ---

/**
 * Check if (qx, qy) lies on a convex hull edge. Returns [vertA, vertB] or null.
 */
function findHullEdge(
  points: Float64Array,
  hull: Uint32Array,
  qx: number,
  qy: number,
  tolerance: number = 1e-10,
): [number, number] | null {
  for (let i = 0; i < hull.length; i++) {
    const iA = hull[i];
    const iB = hull[(i + 1) % hull.length];
    const ax = points[2 * iA],
      ay = points[2 * iA + 1];
    const bx = points[2 * iB],
      by = points[2 * iB + 1];

    // Check if q is on segment A→B.
    const abx = bx - ax,
      aby = by - ay;
    const ab2 = abx * abx + aby * aby;
    if (ab2 < 1e-30) continue;

    // Project q onto line AB.
    const t = ((qx - ax) * abx + (qy - ay) * aby) / ab2;
    if (t < -tolerance || t > 1 + tolerance) continue;

    // Distance from q to line AB.
    const cross = (qx - ax) * aby - (qy - ay) * abx;
    const dist2 = (cross * cross) / ab2;
    if (dist2 < tolerance * tolerance * ab2) {
      return [iA, iB];
    }
  }
  return null;
}

/** Compute linear interpolation weights for a point on a hull edge. */
function hullEdgeWeights(
  points: Float64Array,
  [iA, iB]: [number, number],
  qx: number,
  qy: number,
): NaturalNeighborResult {
  const ax = points[2 * iA],
    ay = points[2 * iA + 1];
  const bx = points[2 * iB],
    by = points[2 * iB + 1];
  const abx = bx - ax,
    aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  const t = ab2 > 0 ? ((qx - ax) * abx + (qy - ay) * aby) / ab2 : 0.5;
  const weights = new Map<number, number>();
  weights.set(iA, 1 - t);
  weights.set(iB, t);
  return { weights, barycentricDeviation: 0 };
}

/**
 * Order boundary halfedges into a cycle by chaining: dst of one = src of next.
 */
function orderBoundary(
  edges: number[],
  triangles: Uint32Array,
): number[] | null {
  if (edges.length === 0) return null;

  // src of cavity halfedge he = triangles[he]
  // dst of cavity halfedge he = triangles[nextHe(he)]
  const dstOf = (he: number) => triangles[nextHe(he)];

  // Build map: src vertex → halfedge
  const srcMap = new Map<number, number>();
  for (const he of edges) {
    srcMap.set(triangles[he], he);
  }

  const ordered: number[] = [];
  let cur = edges[0];
  for (let i = 0; i < edges.length; i++) {
    ordered.push(cur);
    const dst = dstOf(cur);
    const next = srcMap.get(dst);
    if (next === undefined) return null;
    cur = next;
  }

  // Verify it's a cycle.
  if (dstOf(ordered[ordered.length - 1]) !== triangles[ordered[0]]) return null;

  return ordered;
}

function inCircumcircle(
  points: Float64Array,
  triangles: Uint32Array,
  t: number,
  qx: number,
  qy: number,
): boolean {
  const i0 = triangles[3 * t],
    i1 = triangles[3 * t + 1],
    i2 = triangles[3 * t + 2];
  const ax = points[2 * i0] - qx,
    ay = points[2 * i0 + 1] - qy;
  const bx = points[2 * i1] - qx,
    by = points[2 * i1 + 1] - qy;
  const cx = points[2 * i2] - qx,
    cy = points[2 * i2 + 1] - qy;

  const det =
    (ax * ax + ay * ay) * (bx * cy - cx * by) +
    (bx * bx + by * by) * (cx * ay - ax * cy) +
    (cx * cx + cy * cy) * (ax * by - bx * ay);

  // orient2d of triangle: positive = CCW, negative = CW.
  // For CCW triangles, in-circle is det > 0. For CW, det < 0.
  // Multiply by orient sign so we always check > 0.
  const orient = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return orient * det > 0;
}

function circumcenter(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D) < 1e-30) {
    return { x: (ax + bx + cx) / 3, y: (ay + by + cy) / 3 };
  }
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  return {
    x: (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / D,
    y: (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / D,
  };
}

/** Circumcenter of the triangle containing halfedge `he`, shifted so query is at origin. */
function triCircumcenter(
  points: Float64Array,
  triangles: Uint32Array,
  he: number,
  qx: number,
  qy: number,
): { x: number; y: number } {
  const t = Math.floor(he / 3);
  const i0 = triangles[3 * t],
    i1 = triangles[3 * t + 1],
    i2 = triangles[3 * t + 2];
  return circumcenter(
    points[2 * i0] - qx,
    points[2 * i0 + 1] - qy,
    points[2 * i1] - qx,
    points[2 * i1 + 1] - qy,
    points[2 * i2] - qx,
    points[2 * i2 + 1] - qy,
  );
}
