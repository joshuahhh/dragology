import { describe, expect, it } from "vitest";
import { CoincidentPointsError, Delaunay } from "./delaunay";
import { Vec2 } from "./vec2";

describe("coincident points", () => {
  it("throws CoincidentPointsError for two identical points", () => {
    expect(() => new Delaunay([[1, 2], [1, 2]])).toThrow(CoincidentPointsError);
  });

  it("reports the correct indices", () => {
    try {
      new Delaunay([[0, 0], [1, 1], [0, 0]]);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CoincidentPointsError);
      expect((e as CoincidentPointsError).indexA).toBe(0);
      expect((e as CoincidentPointsError).indexB).toBe(2);
    }
  });

  it("reports the first coincident pair found", () => {
    try {
      new Delaunay([[5, 5], [1, 1], [5, 5], [1, 1]]);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CoincidentPointsError);
      expect((e as CoincidentPointsError).indexA).toBe(0);
      expect((e as CoincidentPointsError).indexB).toBe(2);
    }
  });

  it("allows distinct points", () => {
    expect(() => new Delaunay([[0, 0], [1, 0], [0, 1]])).not.toThrow();
  });
});

describe("findTriangle", () => {
  it("works in weird collinear case #1", () => {
    const delaunay = new Delaunay([
      [250, 0],
      [250, 50],
    ]);
    const pt = Vec2(250, 55);
    expect(delaunay.findTriangle(pt)).toEqual(-1);
  });

  it("works in weird collinear case #2", () => {
    const delaunay = new Delaunay([
      [250, 0],
      [250, 50],
    ]);
    const pt = Vec2(300, 55);
    expect(delaunay.findTriangle(pt)).toEqual(-1);
  });

  it("works in weird collinear case #3", () => {
    const delaunay = new Delaunay([
      [250, 0],
      [250, 50],
      [250, 100],
    ]);
    const pt = Vec2(250, 55);
    expect(delaunay.findTriangle(pt)).toEqual(-1);
  });
});
