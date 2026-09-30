import { describe, expect, it } from "vitest";
import { getLocalBounds } from "./bounds";

describe("getLocalBounds", () => {
  it("bounds a polygon's points", () => {
    expect(getLocalBounds(<polygon points="0,0 10,-5 4 20" />)).toEqual({
      empty: false,
      minX: 0,
      minY: -5,
      maxX: 10,
      maxY: 20,
    });
  });

  it("bounds a polyline's points", () => {
    expect(getLocalBounds(<polyline points="1 2, 3 4" />)).toEqual({
      empty: false,
      minX: 1,
      minY: 2,
      maxX: 3,
      maxY: 4,
    });
  });

  it("treats a polygon without points as empty", () => {
    expect(getLocalBounds(<polygon />)).toEqual({ empty: true });
  });

  it("bounds a foreignObject by its box, not its HTML content", () => {
    expect(
      getLocalBounds(
        <foreignObject x={10} y={20} width={300} height={40}>
          <input type="text" />
        </foreignObject>,
      ),
    ).toEqual({ empty: false, minX: 10, minY: 20, maxX: 310, maxY: 60 });
  });

  it("includes polygons inside transformed groups", () => {
    expect(
      getLocalBounds(
        <g>
          <g transform="translate(100, 0)">
            <polygon points="0,0 10,10" />
          </g>
        </g>,
      ),
    ).toEqual({ empty: false, minX: 100, minY: 0, maxX: 110, maxY: 10 });
  });
});
