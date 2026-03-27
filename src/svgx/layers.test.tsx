import { describe, expect, it } from "vitest";
import { drawLayered, layeredExtract, LayeredSvgx, layerSvg } from "./layers";

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
          "" => <g />,
          "r1" => <rect
            id="r1"
          />,
          "c1" => <circle
            id="c1"
          />,
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
          "" => <g
            transform="translate(10, 20)"
          />,
          "r1" => <rect
            id="r1"
            transform="translate(10, 20)"
          />,
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
          "" => <g
            transform="translate(10, 20)"
          >
            <g
              transform="rotate(45)"
            />
          </g>,
          "r1" => <rect
            id="r1"
            transform="translate(10, 20) rotate(45) scale(2)"
          />,
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
          "" => <g
            transform="translate(100, 0)"
          >
            <g
              transform="rotate(90)"
            />
          </g>,
          "r1" => <rect
            id="r1"
            transform="translate(100, 0) rotate(90)"
          />,
          "c1" => <circle
            id="c1"
            transform="translate(100, 0) rotate(90) scale(0.5)"
          />,
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
          "" => <g
            transform="translate(10, 20)"
          />,
          "r1" => <rect
            fill="red"
            id="r1"
            transform="translate(10, 20)"
            x={5}
            y={10}
          />,
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
          "" => <g>
            <rect />
            <line />
          </g>,
          "c1" => <circle
            id="c1"
          />,
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
          "" => <React.Fragment>
            <g
              transform="translate(10, 10)"
            />
          </React.Fragment>,
          "r1" => <rect
            id="r1"
            transform="translate(0, 0)"
          />,
          "c1" => <circle
            id="c1"
            transform="translate(10, 10)"
          />,
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
          "group1" => <g
            id="group1"
            transform="translate(50, 50)"
          >
            <rect />
            <circle />
          </g>,
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
          "" => <React.Fragment>
            <g
              transform="translate(10, 10)"
            />
          </React.Fragment>,
          "inner" => <g
            id="inner"
            transform="translate(10, 10) rotate(45)"
          >
            <rect />
          </g>,
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
          "" => <g
            className="wrapper"
          >
            <g
              transform="translate(100, 100)"
            />
          </g>,
          "r1" => <rect
            id="r1"
            transform="translate(100, 100)"
          />,
          "c1" => <circle
            id="c1"
            transform="translate(100, 100)"
          />,
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
          "" => <g
            transform="translate(10, 10)"
          />,
          "inner" => <rect
            id="inner"
            transform="translate(10, 10) rotate(45)"
            x={5}
          />,
          "outer" => <g
            id="outer"
            transform="translate(10, 10) rotate(45)"
          >
            <circle />
          </g>,
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
          "" => <g
            transform="translate(50, 100)"
          />,
          "label1" => <text
            id="label1"
            transform="translate(50, 100)"
            x={10}
            y={20}
          >
            hi
          </text>,
          "r1" => <rect
            id="r1"
            transform="translate(50, 100)"
          />,
        },
        "descendents": Map {},
      }
    `);
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
          "r1" => <rect
            id="r1"
          />,
        },
        "descendents": Map {},
      }
    `);
    expect(remaining).toMatchInlineSnapshot(`
      {
        "byId": Map {
          "" => <g />,
          "c1" => <circle
            id="c1"
          />,
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
          "inner" => <rect
            id="inner"
            transform="translate(10, 10) rotate(45)"
            x={5}
          />,
          "outer" => <g
            id="outer"
            transform="translate(10, 10) rotate(45)"
          >
            <circle />
          </g>,
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
          "" => <g
            transform="translate(10, 10)"
          />,
          "sibling" => <rect
            id="sibling"
            transform="translate(10, 10)"
          />,
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
          "c" => <rect
            id="c"
          />,
          "b" => <g
            id="b"
          />,
          "a" => <g
            id="a"
          />,
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
          "" => <g />,
          "d" => <rect
            id="d"
          />,
        },
        "descendents": Map {},
      }
    `);
  });
});

describe("drawLayered", () => {
  it("strips dragology* props from output", () => {
    const layered: LayeredSvgx = {
      byId: new Map([
        [
          "r1",
          <rect
            id="r1"
            dragologyZIndex={3}
            dragologyTransition={true}
            x={10}
          />,
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
      byId: new Map([
        [
          "g1",
          <g id="g1" dragologyZIndex={1}>
            <rect dragologyTransition={true} x={5} />
          </g>,
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

  it("sorts layers by dragologyZIndex", () => {
    const layered: LayeredSvgx = {
      byId: new Map([
        ["a", <rect id="a" dragologyZIndex={10} />],
        ["b", <rect id="b" dragologyZIndex={-5} />],
        ["c", <rect id="c" dragologyZIndex={0} />],
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

  it("treats missing dragologyZIndex as 0", () => {
    const layered: LayeredSvgx = {
      byId: new Map([
        ["a", <rect id="a" dragologyZIndex={1} />],
        ["b", <rect id="b" />],
        ["c", <rect id="c" dragologyZIndex={-1} />],
      ]),
      descendents: new Map(),
    };

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
});
