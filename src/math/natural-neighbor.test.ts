import { describe, expect, it } from "vitest";
import {
  NaturalNeighborResult,
  naturalNeighborWeights,
} from "./natural-neighbor";
import { Vec2 } from "./vec2";

function assertIsWeights(
  result: ReturnType<typeof naturalNeighborWeights>,
): asserts result is NaturalNeighborResult {
  expect(result).not.toBeNull();
  expect(result).toHaveProperty("weights");
}

describe("naturalNeighborWeights", () => {
  it("returns null for fewer than 3 points", () => {
    expect(
      naturalNeighborWeights([Vec2(0, 0), Vec2(1, 1)], Vec2(0.5, 0.5)),
    ).toBeNull();
  });

  it("weights sum to 1", () => {
    const points = [
      Vec2(0, 0),
      Vec2(10, 0),
      Vec2(10, 10),
      Vec2(0, 10),
      Vec2(5, 5),
    ];
    const result = naturalNeighborWeights(points, Vec2(3, 4));
    assertIsWeights(result);
    const sum = [...result.weights.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("all weights are non-negative", () => {
    const points = [
      Vec2(0, 0),
      Vec2(10, 0),
      Vec2(10, 10),
      Vec2(0, 10),
      Vec2(5, 5),
    ];
    const result = naturalNeighborWeights(points, Vec2(3, 4));
    assertIsWeights(result);
    for (const w of result.weights.values()) {
      expect(w).toBeGreaterThanOrEqual(-1e-10);
    }
  });

  it("has near-zero barycentric deviation", () => {
    const points = [
      Vec2(0, 0),
      Vec2(10, 0),
      Vec2(10, 10),
      Vec2(0, 10),
      Vec2(5, 5),
    ];
    const result = naturalNeighborWeights(points, Vec2(3, 4));
    assertIsWeights(result);
    expect(result.barycentricDeviation).toBeLessThan(1e-10);
  });

  it("returns full weight on vertex when query is coincident", () => {
    const points = [Vec2(0, 0), Vec2(10, 0), Vec2(5, 10)];
    const result = naturalNeighborWeights(points, Vec2(0, 0));
    assertIsWeights(result);
    expect(result.weights.get(0)).toBe(1);
    expect(result.weights.size).toBe(1);
  });

  it("returns null for query outside convex hull", () => {
    const points = [Vec2(0, 0), Vec2(10, 0), Vec2(5, 10)];
    const result = naturalNeighborWeights(points, Vec2(-5, -5));
    expect(result).toBeNull();
  });

  // Tinfour correctness test:
  // For a regular grid of points, the natural neighbor interpolation of
  // f(x,y) = x should exactly reproduce x (and similarly for y).
  // This works because Sibson coordinates are barycentric coordinates,
  // so they exactly reproduce linear functions.
  it("exactly reproduces linear functions (Tinfour correctness test)", () => {
    // Create a grid of points with known values
    const points: Vec2[] = [];
    for (let ix = 0; ix <= 10; ix++) {
      for (let iy = 0; iy <= 10; iy++) {
        points.push(Vec2(ix, iy));
      }
    }

    // Test at several interior points
    const queries = [
      Vec2(3.7, 4.2),
      Vec2(7.1, 2.9),
      Vec2(5.3, 5.7),
      Vec2(1.3, 8.6),
      Vec2(6.5, 3.3),
    ];

    for (const q of queries) {
      const result = naturalNeighborWeights(points, q);
      assertIsWeights(result);

      // Reconstruct x and y from weights — should match query exactly
      let xRecon = 0;
      let yRecon = 0;
      for (const [idx, w] of result.weights) {
        xRecon += w * points[idx].x;
        yRecon += w * points[idx].y;
      }

      expect(xRecon).toBeCloseTo(q.x, 8);
      expect(yRecon).toBeCloseTo(q.y, 8);
    }
  });

  // Randomized correctness test: generate 10 random point sets, query at their
  // centroid (guaranteed interior), and verify linear reproduction.
  it("reproduces linear functions for random point sets (10 trials)", () => {
    // Seeded PRNG for determinism
    let seed = 12345;
    const rand = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return seed / 2147483647;
    };

    for (let trial = 0; trial < 10; trial++) {
      const n = 10;
      const points: Vec2[] = [];
      for (let i = 0; i < n; i++) {
        points.push(Vec2(rand() * 100, rand() * 100));
      }

      // Centroid is guaranteed inside the convex hull
      const cx = points.reduce((s, p) => s + p.x, 0) / n;
      const cy = points.reduce((s, p) => s + p.y, 0) / n;
      const q = Vec2(cx, cy);

      const result = naturalNeighborWeights(points, q);
      assertIsWeights(result);

      let xRecon = 0;
      let yRecon = 0;
      for (const [idx, w] of result.weights) {
        xRecon += w * points[idx].x;
        yRecon += w * points[idx].y;
      }

      expect(xRecon).toBeCloseTo(q.x, 8);
      expect(yRecon).toBeCloseTo(q.y, 8);
    }
  });

  // Verify that for a simple triangle, the weights match barycentric coordinates
  it("matches barycentric coordinates for a single triangle", () => {
    const points = [Vec2(0, 0), Vec2(10, 0), Vec2(0, 10)];
    const q = Vec2(2, 3);
    const result = naturalNeighborWeights(points, q);
    assertIsWeights(result);

    // For a single triangle, natural neighbor weights should equal barycentric weights.
    // Check they reproduce the point.
    let xRecon = 0;
    let yRecon = 0;
    for (const [idx, w] of result.weights) {
      xRecon += w * points[idx].x;
      yRecon += w * points[idx].y;
    }
    expect(xRecon).toBeCloseTo(2, 10);
    expect(yRecon).toBeCloseTo(3, 10);
  });

  // Near hull edge: query near the edge of the convex hull should get most
  // weight from the two hull-edge vertices, not the interior point.
  it("interior point gets low weight near hull edge", () => {
    const points = [
      Vec2(150, 150), // 0: top-left
      Vec2(450, 150), // 1: top-right
      Vec2(450, 450), // 2: bottom-right
      Vec2(150, 450), // 3: bottom-left
      Vec2(300, 300), // 4: center
    ];

    // Query near the top edge, far from center
    const q = Vec2(300, 155);
    const result = naturalNeighborWeights(points, q);
    assertIsWeights(result);

    const centerWeight = result.weights.get(4) ?? 0;
    const topLeftWeight = result.weights.get(0) ?? 0;
    const topRightWeight = result.weights.get(1) ?? 0;

    // The two hull edge vertices should dominate
    expect(topLeftWeight + topRightWeight).toBeGreaterThan(0.8);
    // The center point should contribute very little this close to the edge
    expect(centerWeight).toBeLessThan(0.1);

    // Weights should still sum to 1 and reproduce the query point
    const sum = [...result.weights.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);

    let xRecon = 0;
    let yRecon = 0;
    for (const [idx, w] of result.weights) {
      xRecon += w * points[idx].x;
      yRecon += w * points[idx].y;
    }
    expect(xRecon).toBeCloseTo(q.x, 6);
    expect(yRecon).toBeCloseTo(q.y, 6);
  });

  // Query exactly on the hull edge (not on a vertex).
  it("returns valid weights for query exactly on hull edge", () => {
    const points = [
      Vec2(150, 150), // 0: top-left
      Vec2(450, 150), // 1: top-right
      Vec2(450, 450), // 2: bottom-right
      Vec2(150, 450), // 3: bottom-left
      Vec2(300, 300), // 4: center
    ];

    // Exactly on the top edge, midpoint between 0 and 1
    const q = Vec2(300, 150);
    const result = naturalNeighborWeights(points, q);

    // Should not return null — it's on the boundary, not outside
    assertIsWeights(result);

    // The two edge vertices should get nearly all the weight
    const topLeftWeight = result.weights.get(0) ?? 0;
    const topRightWeight = result.weights.get(1) ?? 0;
    expect(topLeftWeight + topRightWeight).toBeGreaterThan(0.95);

    // Should reproduce the query point
    let xRecon = 0;
    let yRecon = 0;
    for (const [idx, w] of result.weights) {
      xRecon += w * points[idx].x;
      yRecon += w * points[idx].y;
    }
    expect(xRecon).toBeCloseTo(q.x, 6);
    expect(yRecon).toBeCloseTo(q.y, 6);
  });

  it("projectOutside returns weights for query outside convex hull", () => {
    const points = [Vec2(0, 0), Vec2(10, 0), Vec2(5, 10)];
    // Without flag: null
    expect(naturalNeighborWeights(points, Vec2(5, -5))).toBeNull();
    // With flag: projects onto hull and returns weights
    const result = naturalNeighborWeights(points, Vec2(5, -5), {
      projectOutside: true,
    });
    assertIsWeights(result);
    const sum = [...result.weights.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  // Symmetry test: for a regular polygon, querying the center should give equal weights
  it("gives equal weights at center of regular polygon", () => {
    const n = 6;
    const points: Vec2[] = [];
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n;
      points.push(Vec2(10 * Math.cos(angle), 10 * Math.sin(angle)));
    }

    const result = naturalNeighborWeights(points, Vec2(0, 0));
    assertIsWeights(result);

    const expectedWeight = 1 / result.weights.size;
    for (const w of result.weights.values()) {
      expect(w).toBeCloseTo(expectedWeight, 5);
    }
  });
});
