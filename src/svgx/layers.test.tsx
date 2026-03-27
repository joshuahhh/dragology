import { describe, expect, it } from "vitest";
import {
  compareStackingPaths,
  drawLayered,
  Layer,
  layeredExtract,
  LayeredSvgx,
  layerSvg,
} from "./layers";

describe("layerSvg", () => {
  it("pulls nodes with IDs to the top level", () => {
    const tree = (
      <g>
        <rect id="r1" />
        <circle id="c1" />
      </g>
    );

    expect(layerSvg(tree)).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "" => {
            "element": <g />,
            "stackingPath": [],
          },
          "r1" => {
            "element": <rect
              id="r1"
            />,
            "stackingPath": [
              0,
            ],
          },
          "c1" => {
            "element": <circle
              id="c1"
            />,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {},
      }
    `);
  });

  it("accumulates transforms from parent <g> nodes", () => {
    const tree = (
      <g transform="translate(10, 20)">
        <rect id="r1" />
      </g>
    );

    expect(layerSvg(tree)).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "" => {
            "element": <g
              transform="translate(10, 20)"
            />,
            "stackingPath": [],
          },
          "r1" => {
            "element": <rect
              id="r1"
              transform="translate(10, 20)"
            />,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {},
      }
    `);
  });

  it("combines multiple transforms", () => {
    const tree = (
      <g transform="translate(10, 20)">
        <g transform="rotate(45)">
          <rect id="r1" transform="scale(2)" />
        </g>
      </g>
    );

    expect(layerSvg(tree)).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "" => {
            "element": <g
              transform="translate(10, 20)"
            >
              <g
                transform="rotate(45)"
              />
            </g>,
            "stackingPath": [],
          },
          "r1" => {
            "element": <rect
              id="r1"
              transform="translate(10, 20) rotate(45) scale(2)"
            />,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {},
      }
    `);
  });

  it("handles deeply nested groups with multiple ID'd elements", () => {
    const tree = (
      <g transform="translate(100, 0)">
        <g transform="rotate(90)">
          <rect id="r1" />
          <circle id="c1" transform="scale(0.5)" />
        </g>
      </g>
    );

    expect(layerSvg(tree)).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "" => {
            "element": <g
              transform="translate(100, 0)"
            >
              <g
                transform="rotate(90)"
              />
            </g>,
            "stackingPath": [],
          },
          "r1" => {
            "element": <rect
              id="r1"
              transform="translate(100, 0) rotate(90)"
            />,
            "stackingPath": [
              0,
            ],
          },
          "c1" => {
            "element": <circle
              id="c1"
              transform="translate(100, 0) rotate(90) scale(0.5)"
            />,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {},
      }
    `);
  });

  it("preserves other props on ID'd elements", () => {
    const tree = (
      <g transform="translate(10, 20)">
        <rect id="r1" x={5} y={10} fill="red" />
      </g>
    );

    expect(layerSvg(tree)).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "" => {
            "element": <g
              transform="translate(10, 20)"
            />,
            "stackingPath": [],
          },
          "r1" => {
            "element": <rect
              fill="red"
              id="r1"
              transform="translate(10, 20)"
              x={5}
              y={10}
            />,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {},
      }
    `);
  });

  it("handles elements without IDs", () => {
    const tree = (
      <g>
        <rect />
        <circle id="c1" />
        <line />
      </g>
    );

    expect(layerSvg(tree)).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "" => {
            "element": <g>
              <rect />
              <line />
            </g>,
            "stackingPath": [],
          },
          "c1" => {
            "element": <circle
              id="c1"
            />,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {},
      }
    `);
  });

  it("handles mixed nesting levels", () => {
    const tree = (
      <>
        <rect id="r1" transform="translate(0, 0)" />
        <g transform="translate(10, 10)">
          <circle id="c1" />
        </g>
      </>
    );

    expect(layerSvg(tree)).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "" => {
            "element": <React.Fragment>
              <g
                transform="translate(10, 10)"
              />
            </React.Fragment>,
            "stackingPath": [],
          },
          "r1" => {
            "element": <rect
              id="r1"
              transform="translate(0, 0)"
            />,
            "stackingPath": [
              0,
            ],
          },
          "c1" => {
            "element": <circle
              id="c1"
              transform="translate(10, 10)"
            />,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {},
      }
    `);
  });

  it("handles a <g> with an id", () => {
    const tree = (
      <g id="group1" transform="translate(50, 50)">
        <rect />
        <circle />
      </g>
    );

    expect(layerSvg(tree)).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "group1" => {
            "element": <g
              id="group1"
              transform="translate(50, 50)"
            >
              <rect />
              <circle />
            </g>,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {},
      }
    `);
  });

  it("handles nested <g> with IDs", () => {
    const tree = (
      <>
        <g transform="translate(10, 10)">
          <g id="inner" transform="rotate(45)">
            <rect />
          </g>
        </g>
      </>
    );

    expect(layerSvg(tree)).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "" => {
            "element": <React.Fragment>
              <g
                transform="translate(10, 10)"
              />
            </React.Fragment>,
            "stackingPath": [],
          },
          "inner" => {
            "element": <g
              id="inner"
              transform="translate(10, 10) rotate(45)"
            >
              <rect />
            </g>,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {},
      }
    `);
  });

  it("works with non-fragment root (like <g>)", () => {
    const tree = (
      <g className="wrapper">
        <g transform="translate(100, 100)">
          <rect id="r1" />
          <circle id="c1" />
        </g>
      </g>
    );

    expect(layerSvg(tree)).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "" => {
            "element": <g
              className="wrapper"
            >
              <g
                transform="translate(100, 100)"
              />
            </g>,
            "stackingPath": [],
          },
          "r1" => {
            "element": <rect
              id="r1"
              transform="translate(100, 100)"
            />,
            "stackingPath": [
              0,
            ],
          },
          "c1" => {
            "element": <circle
              id="c1"
              transform="translate(100, 100)"
            />,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {},
      }
    `);
  });

  it("extracts nested IDs (ID inside ID)", () => {
    const tree = (
      <g transform="translate(10, 10)">
        <g id="outer" transform="rotate(45)">
          <rect id="inner" x={5} />
          <circle />
        </g>
      </g>
    );

    expect(layerSvg(tree)).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "" => {
            "element": <g
              transform="translate(10, 10)"
            />,
            "stackingPath": [],
          },
          "inner" => {
            "element": <rect
              id="inner"
              transform="translate(10, 10) rotate(45)"
              x={5}
            />,
            "stackingPath": [
              0,
              0,
            ],
          },
          "outer" => {
            "element": <g
              id="outer"
              transform="translate(10, 10) rotate(45)"
            >
              <circle />
            </g>,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {
          "outer" => Set {
            "inner",
          },
        },
      }
    `);
  });

  it("handles <text> elements with IDs", () => {
    const tree = (
      <g transform="translate(50, 100)">
        <text id="label1" x={10} y={20}>
          hi
        </text>
        <rect id="r1" />
      </g>
    );

    expect(layerSvg(tree)).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "" => {
            "element": <g
              transform="translate(50, 100)"
            />,
            "stackingPath": [],
          },
          "label1" => {
            "element": <text
              id="label1"
              transform="translate(50, 100)"
              x={10}
              y={20}
            >
              hi
            </text>,
            "stackingPath": [
              0,
            ],
          },
          "r1" => {
            "element": <rect
              id="r1"
              transform="translate(50, 100)"
            />,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {},
      }
    `);
  });

  it("builds stacking paths from nested z-indices", () => {
    const tree = (
      <g>
        <g id="outer" dragologyZIndex={5}>
          <rect id="inner" dragologyZIndex={3} />
        </g>
      </g>
    );

    const layered = layerSvg(tree);
    expect(layered.byId.get("outer")!.stackingPath).toEqual([5]);
    expect(layered.byId.get("inner")!.stackingPath).toEqual([5, 3]);
  });

  it("appends 0 when no z-index provided", () => {
    const tree = (
      <g>
        <g id="outer" dragologyZIndex={5}>
          <rect id="inner" />
        </g>
      </g>
    );

    const layered = layerSvg(tree);
    expect(layered.byId.get("inner")!.stackingPath).toEqual([5, 0]);
  });

  it("supports absolute z-index with slash syntax", () => {
    const tree = (
      <g>
        <g id="outer" dragologyZIndex={5}>
          <rect id="inner" dragologyZIndex="/10" />
        </g>
      </g>
    );

    const layered = layerSvg(tree);
    expect(layered.byId.get("inner")!.stackingPath).toEqual([10]);
  });

  it("supports negative absolute z-index", () => {
    const tree = (
      <g>
        <g id="outer" dragologyZIndex={5}>
          <rect id="inner" dragologyZIndex="/-3" />
        </g>
      </g>
    );

    const layered = layerSvg(tree);
    expect(layered.byId.get("inner")!.stackingPath).toEqual([-3]);
  });

  it("absolute z-index escapes deep nesting", () => {
    const tree = (
      <g>
        <g id="a" dragologyZIndex={1}>
          <g id="b" dragologyZIndex={2}>
            <rect id="deep" dragologyZIndex="/1" />
            <rect id="relative" dragologyZIndex={3} />
          </g>
        </g>
      </g>
    );

    const layered = layerSvg(tree);
    expect(layered.byId.get("a")!.stackingPath).toEqual([1]);
    expect(layered.byId.get("b")!.stackingPath).toEqual([1, 2]);
    expect(layered.byId.get("deep")!.stackingPath).toEqual([1]);
    expect(layered.byId.get("relative")!.stackingPath).toEqual([1, 2, 3]);
  });

  it("rejects invalid absolute z-index strings", () => {
    const tree = (
      <g>
        <rect id="r1" dragologyZIndex="/abc" />
      </g>
    );

    expect(() => layerSvg(tree)).toThrow(/Invalid absolute dragologyZIndex/);
  });

  it("throws error if dragologyZIndex is set without id", () => {
    const tree = (
      <g>
        <rect dragologyZIndex={5} x={10} y={10} />
      </g>
    );

    expect(() => layerSvg(tree)).toThrow(
      /dragologyZIndex can only be set on elements with an id attribute/,
    );
  });

  it("accumulates opacity from parent nodes", () => {
    const tree = (
      <g opacity={0.5}>
        <rect id="r1" />
      </g>
    );

    const layered = layerSvg(tree);
    expect(layered.byId.get("r1")!.element.props.opacity).toBe(0.5);
  });

  it("multiplies nested opacities", () => {
    const tree = (
      <g opacity={0.5}>
        <g opacity={0.4}>
          <rect id="r1" />
        </g>
      </g>
    );

    const layered = layerSvg(tree);
    expect(layered.byId.get("r1")!.element.props.opacity).toBeCloseTo(0.2);
  });

  it("combines element's own opacity with accumulated opacity", () => {
    const tree = (
      <g opacity={0.5}>
        <rect id="r1" opacity={0.6} />
      </g>
    );

    const layered = layerSvg(tree);
    expect(layered.byId.get("r1")!.element.props.opacity).toBeCloseTo(0.3);
  });

  it("does not set opacity when fully opaque", () => {
    const tree = (
      <g>
        <rect id="r1" />
      </g>
    );

    const layered = layerSvg(tree);
    expect(layered.byId.get("r1")!.element.props.opacity).toBeUndefined();
  });

  it("accumulates opacity through nested IDs", () => {
    const tree = (
      <g opacity={0.5}>
        <g id="outer" opacity={0.8}>
          <rect id="inner" />
        </g>
      </g>
    );

    const layered = layerSvg(tree);
    expect(layered.byId.get("outer")!.element.props.opacity).toBeCloseTo(0.4);
    expect(layered.byId.get("inner")!.element.props.opacity).toBeCloseTo(0.4);
  });

  it("allows dragologyZIndex on elements with id", () => {
    const tree = (
      <g>
        <rect id="r1" dragologyZIndex={5} x={10} y={10} />
      </g>
    );

    expect(() => layerSvg(tree)).not.toThrow();
  });

  it("throws error if duplicate IDs are found at same level", () => {
    const tree = (
      <g>
        <rect id="duplicate" x={10} y={10} />
        <circle id="duplicate" cx={50} cy={50} r={20} />
      </g>
    );

    expect(() => layerSvg(tree)).toThrow(
      /Duplicate id "duplicate" found in SVG tree/,
    );
  });

  it("throws error if duplicate IDs are found at different levels", () => {
    const tree = (
      <g>
        <rect id="duplicate" x={10} y={10} />
        <g transform="translate(100, 100)">
          <circle id="duplicate" cx={50} cy={50} r={20} />
        </g>
      </g>
    );

    expect(() => layerSvg(tree)).toThrow(
      /Duplicate id "duplicate" found in SVG tree/,
    );
  });

  it("throws error if duplicate IDs are found in nested groups", () => {
    const tree = (
      <g>
        <g id="outer">
          <rect id="inner" x={10} y={10} />
        </g>
        <g transform="translate(100, 100)">
          <circle id="inner" cx={50} cy={50} r={20} />
        </g>
      </g>
    );

    expect(() => layerSvg(tree)).toThrow(
      /Duplicate id "inner" found in SVG tree/,
    );
  });
});

describe("layeredExtract", () => {
  it("extracts a single element with no descendants", () => {
    const tree = (
      <g>
        <rect id="r1" />
        <circle id="c1" />
      </g>
    );

    const layered = layerSvg(tree);
    const { extracted, remaining } = layeredExtract(layered, "r1");

    expect(extracted).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "r1" => {
            "element": <rect
              id="r1"
            />,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {},
      }
    `);
    expect(remaining).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "" => {
            "element": <g />,
            "stackingPath": [],
          },
          "c1" => {
            "element": <circle
              id="c1"
            />,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {},
      }
    `);
  });

  it("extracts an element and its descendants", () => {
    const tree = (
      <g transform="translate(10, 10)">
        <g id="outer" transform="rotate(45)">
          <rect id="inner" x={5} />
          <circle />
        </g>
        <rect id="sibling" />
      </g>
    );

    const layered = layerSvg(tree);
    const { extracted, remaining } = layeredExtract(layered, "outer");

    expect(extracted).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "inner" => {
            "element": <rect
              id="inner"
              transform="translate(10, 10) rotate(45)"
              x={5}
            />,
            "stackingPath": [
              0,
              0,
            ],
          },
          "outer" => {
            "element": <g
              id="outer"
              transform="translate(10, 10) rotate(45)"
            >
              <circle />
            </g>,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {
          "outer" => Set {
            "inner",
          },
        },
      }
    `);
    expect(remaining).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "" => {
            "element": <g
              transform="translate(10, 10)"
            />,
            "stackingPath": [],
          },
          "sibling" => {
            "element": <rect
              id="sibling"
              transform="translate(10, 10)"
            />,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {},
      }
    `);
  });

  it("extracts deeply nested descendants", () => {
    const tree = (
      <g>
        <g id="a">
          <g id="b">
            <rect id="c" />
          </g>
        </g>
        <rect id="d" />
      </g>
    );

    const layered = layerSvg(tree);
    const { extracted, remaining } = layeredExtract(layered, "a");

    expect(extracted).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "c" => {
            "element": <rect
              id="c"
            />,
            "stackingPath": [
              0,
              0,
              0,
            ],
          },
          "b" => {
            "element": <g
              id="b"
            />,
            "stackingPath": [
              0,
              0,
            ],
          },
          "a" => {
            "element": <g
              id="a"
            />,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {
          "b" => Set {
            "c",
          },
          "a" => Set {
            "b",
            "c",
          },
        },
      }
    `);
    expect(remaining).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "" => {
            "element": <g />,
            "stackingPath": [],
          },
          "d" => {
            "element": <rect
              id="d"
            />,
            "stackingPath": [
              0,
            ],
          },
        },
        "descendents": Map {},
      }
    `);
  });
});

describe("drawLayered", () => {
  it("preserves sibling order at matching stacking paths", () => {
    const tree = (
      <g>
        <rect id="first" />
        <rect id="second" />
        <rect id="third" />
      </g>
    );

    expect(drawLayered(layerSvg(tree))).toMatchInlineSnapshot(`
      <React.Fragment>
        <React.Fragment>
          <g />
        </React.Fragment>
        <React.Fragment>
          <rect
            id="first"
          />
        </React.Fragment>
        <React.Fragment>
          <rect
            id="second"
          />
        </React.Fragment>
        <React.Fragment>
          <rect
            id="third"
          />
        </React.Fragment>
      </React.Fragment>
    `);
  });

  it("strips dragology* props from output", () => {
    const layered: LayeredSvgx = {
      byId: new Map<string, Layer>([
        [
          "r1",
          {
            element: (
              <rect
                id="r1"
                dragologyZIndex={3}
                dragologyTransition={true}
                x={10}
              />
            ),
            stackingPath: [3],
          },
        ],
      ]),
      descendents: new Map(),
    };

    expect(drawLayered(layered)).toMatchInlineSnapshot(`
      <React.Fragment>
        <React.Fragment>
          <rect
            id="r1"
            x={10}
          />
        </React.Fragment>
      </React.Fragment>
    `);
  });

  it("strips dragology* props from nested children", () => {
    const layered: LayeredSvgx = {
      byId: new Map<string, Layer>([
        [
          "g1",
          {
            element: (
              <g id="g1" dragologyZIndex={1}>
                <rect dragologyTransition={true} x={5} />
              </g>
            ),
            stackingPath: [1],
          },
        ],
      ]),
      descendents: new Map(),
    };

    expect(drawLayered(layered)).toMatchInlineSnapshot(`
      <React.Fragment>
        <React.Fragment>
          <g
            id="g1"
          >
            <rect
              x={5}
            />
          </g>
        </React.Fragment>
      </React.Fragment>
    `);
  });

  it("sorts layers by stacking path", () => {
    const layered: LayeredSvgx = {
      byId: new Map<string, Layer>([
        ["a", { element: <rect id="a" />, stackingPath: [10] }],
        ["b", { element: <rect id="b" />, stackingPath: [-5] }],
        ["c", { element: <rect id="c" />, stackingPath: [0] }],
      ]),
      descendents: new Map(),
    };

    expect(drawLayered(layered)).toMatchInlineSnapshot(`
      <React.Fragment>
        <React.Fragment>
          <rect
            id="b"
          />
        </React.Fragment>
        <React.Fragment>
          <rect
            id="c"
          />
        </React.Fragment>
        <React.Fragment>
          <rect
            id="a"
          />
        </React.Fragment>
      </React.Fragment>
    `);
  });

  it("treats missing stacking path as []", () => {
    const layered: LayeredSvgx = {
      byId: new Map<string, Layer>([
        ["a", { element: <rect id="a" />, stackingPath: [1] }],
        ["b", { element: <rect id="b" />, stackingPath: [] }],
        ["c", { element: <rect id="c" />, stackingPath: [-1] }],
      ]),
      descendents: new Map(),
    };

    // [-1] < [] (-1 < -ε) < [1]
    expect(drawLayered(layered)).toMatchInlineSnapshot(`
      <React.Fragment>
        <React.Fragment>
          <rect
            id="c"
          />
        </React.Fragment>
        <React.Fragment>
          <rect
            id="b"
          />
        </React.Fragment>
        <React.Fragment>
          <rect
            id="a"
          />
        </React.Fragment>
      </React.Fragment>
    `);
  });

  it("sorts by multi-level stacking paths", () => {
    const layered: LayeredSvgx = {
      byId: new Map<string, Layer>([
        ["a", { element: <rect id="a" />, stackingPath: [5, -3] }],
        ["b", { element: <rect id="b" />, stackingPath: [5] }],
        ["c", { element: <rect id="c" />, stackingPath: [3, 10] }],
      ]),
      descendents: new Map(),
    };

    // [3, 10] first (3 < 5), then [5, -3] (-3 < -ε), then [5]
    expect(drawLayered(layered)).toMatchInlineSnapshot(`
      <React.Fragment>
        <React.Fragment>
          <rect
            id="c"
          />
        </React.Fragment>
        <React.Fragment>
          <rect
            id="a"
          />
        </React.Fragment>
        <React.Fragment>
          <rect
            id="b"
          />
        </React.Fragment>
      </React.Fragment>
    `);
  });
});

describe("compareStackingPaths", () => {
  it("equal paths return 0", () => {
    expect(compareStackingPaths([1, 2], [1, 2])).toBe(0);
  });

  it("empty paths are equal", () => {
    expect(compareStackingPaths([], [])).toBe(0);
  });

  it("non-negative extra element means longer path is greater", () => {
    expect(compareStackingPaths([5], [5, 0])).toBeLessThan(0);
    expect(compareStackingPaths([5, 0, 0], [5])).toBeGreaterThan(0);
  });

  it("[5, -3] < [5] because -3 < -ε", () => {
    expect(compareStackingPaths([5, -3], [5])).toBeLessThan(0);
  });

  it("[3, 10] < [5] because 3 < 5", () => {
    expect(compareStackingPaths([3, 10], [5])).toBeLessThan(0);
  });

  it("[] < [0] (parent below child with default z-index)", () => {
    expect(compareStackingPaths([], [0])).toBeLessThan(0);
  });

  it("[] < [1]", () => {
    expect(compareStackingPaths([], [1])).toBeLessThan(0);
  });
});
