import { describe, expect, it, vi } from "vitest";
import { layerSvg } from "./layers";
import { lerpLayeredWeighted, lerpSvgx } from "./lerp";

describe("lerpSvgNode", () => {
  it("lerps numeric props", () => {
    const a = <rect x={0} y={0} width={100} height={100} />;
    const b = <rect x={100} y={50} width={200} height={150} />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <rect
        height={125}
        width={150}
        x={50}
        y={25}
      />
    `);
  });

  it("lerps at t=0 returns first element", () => {
    const a = <rect x={0} width={100} />;
    const b = <rect x={100} width={200} />;

    const result = lerpSvgx(a, b, 0);

    expect(result).toMatchInlineSnapshot(`
      <rect
        width={100}
        x={0}
      />
    `);
  });

  it("lerps at t=1 returns second element", () => {
    const a = <rect x={0} width={100} />;
    const b = <rect x={100} width={200} />;

    const result = lerpSvgx(a, b, 1);

    expect(result).toMatchInlineSnapshot(`
      <rect
        width={200}
        x={100}
      />
    `);
  });

  it("preserves non-numeric props", () => {
    const a = <rect x={0} fill="red" id="r1" />;
    const b = <rect x={100} fill="red" id="r1" />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <rect
        fill="red"
        id="r1"
        x={50}
      />
    `);
  });

  it("handles transform strings", () => {
    const a = <rect transform="translate(0, 0)" />;
    const b = <rect transform="translate(100, 100)" />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <rect
        transform="translate(50, 50)"
      />
    `);
  });

  it("recursively lerps children", () => {
    const a = (
      <g>
        <rect x={0} />
        <circle cx={0} />
      </g>
    );
    const b = (
      <g>
        <rect x={100} />
        <circle cx={100} />
      </g>
    );

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <g>
        <rect
          x={50}
        />
        <circle
          cx={50}
        />
      </g>
    `);
  });

  it("handles nested groups", () => {
    const a = (
      <g>
        <g>
          <rect x={0} />
        </g>
      </g>
    );
    const b = (
      <g>
        <g>
          <rect x={100} />
        </g>
      </g>
    );

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <g>
        <g>
          <rect
            x={50}
          />
        </g>
      </g>
    `);
  });

  it("throws on mismatched element types", () => {
    const a = <rect />;
    const b = <circle />;

    expect(() => lerpSvgx(a, b, 0.5)).toThrow(
      "Cannot lerp between different element types",
    );
  });

  it("handles props only in one element", () => {
    const a = <rect x={0} />;
    const b = <rect x={100} y={50} />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <rect
        x={50}
        y={50}
      />
    `);
  });

  it("lerps color props", () => {
    const a = <rect fill="red" stroke="blue" />;
    const b = <rect fill="green" stroke="yellow" />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <rect
        fill="rgb(161, 108, 0)"
        stroke="rgb(193, 137, 172)"
      />
    `);
  });

  it("lerps style objects with colors", () => {
    const a = <rect style={{ fill: "red", backgroundColor: "blue" }} />;
    const b = <rect style={{ fill: "green", backgroundColor: "yellow" }} />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <rect
        style={
          {
            "backgroundColor": "rgb(193, 137, 172)",
            "fill": "rgb(161, 108, 0)",
          }
        }
      />
    `);
  });

  it("lerps style objects with numeric values", () => {
    const a = <rect style={{ opacity: 0, fontSize: 10 }} />;
    const b = <rect style={{ opacity: 1, fontSize: 20 }} />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <rect
        style={
          {
            "fontSize": 15,
            "opacity": 0.5,
          }
        }
      />
    `);
  });

  it("lerps style objects with mixed types", () => {
    const a = <rect style={{ opacity: 0, fill: "red" }} />;
    const b = <rect style={{ opacity: 1, fill: "blue" }} />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <rect
        style={
          {
            "fill": "rgb(193, 0, 136)",
            "opacity": 0.5,
          }
        }
      />
    `);
  });

  it("handles style objects with different keys", () => {
    const a = <rect style={{ opacity: 0 }} />;
    const b = <rect style={{ opacity: 1, fill: "blue" }} />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <rect
        style={
          {
            "fill": "blue",
            "opacity": 0.5,
          }
        }
      />
    `);
  });

  it("lerps between fill none and fill none", () => {
    const a = <rect fill="none" x={0} />;
    const b = <rect fill="none" x={100} />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <rect
        fill="none"
        x={50}
      />
    `);
  });

  it("lerps between fill none and fill red", () => {
    const a = <rect fill="none" x={0} />;
    const b = <rect fill="red" x={100} />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <rect
        fill="rgba(255, 0, 0, 0.5)"
        x={50}
      />
    `);
  });

  it("lerps between fill red and fill none", () => {
    const a = <rect fill="red" x={0} />;
    const b = <rect fill="none" x={100} />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <rect
        fill="rgba(255, 0, 0, 0.5)"
        x={50}
      />
    `);
  });

  it("lerps polygon points", () => {
    const a = <polygon points="0,0 10,0 10,10" />;
    const b = <polygon points="20,20 30,20 30,30" />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <polygon
        points="10,10 20,10 20,20"
      />
    `);
  });

  it("lerps polygon points at t=0", () => {
    const a = <polygon points="0,0 10,0 10,10" />;
    const b = <polygon points="20,20 30,20 30,30" />;

    const result = lerpSvgx(a, b, 0);

    expect(result).toMatchInlineSnapshot(`
      <polygon
        points="0,0 10,0 10,10"
      />
    `);
  });

  it("lerps polygon points at t=1", () => {
    const a = <polygon points="0,0 10,0 10,10" />;
    const b = <polygon points="20,20 30,20 30,30" />;

    const result = lerpSvgx(a, b, 1);

    expect(result).toMatchInlineSnapshot(`
      <polygon
        points="20,20 30,20 30,30"
      />
    `);
  });

  it("throws on mismatched point counts", () => {
    const a = <polygon points="0,0 10,0 10,10" />;
    const b = <polygon points="20,20 30,20" />;

    expect(() => lerpSvgx(a, b, 0.5)).toThrow(
      "Cannot lerp points: different point counts",
    );
  });

  it("lerps path d attribute", () => {
    const a = <path d="M 0 0 L 10 10" />;
    const b = <path d="M 20 20 L 30 30" />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result.props.d).toBe("M10,10L20,20");
  });

  it("lerps path d attribute at t=0", () => {
    const a = <path d="M 0 0 L 10 10" />;
    const b = <path d="M 20 20 L 30 30" />;

    const result = lerpSvgx(a, b, 0);

    expect(result.props.d).toBe("M0,0L10,10");
  });

  it("lerps path d attribute at t=1", () => {
    const a = <path d="M 0 0 L 10 10" />;
    const b = <path d="M 20 20 L 30 30" />;

    const result = lerpSvgx(a, b, 1);

    // At t=1, d3-interpolate-path returns the original format of b
    expect(result.props.d).toBe("M 20 20 L 30 30");
  });

  it("lerps curved paths", () => {
    const a = <path d="M 0 0 Q 5 10 10 0" />;
    const b = <path d="M 20 20 Q 25 30 30 20" />;

    const result = lerpSvgx(a, b, 0.5);

    // d3-interpolate-path handles curved paths
    expect(result.props.d).toBeTruthy();
    expect(typeof result.props.d).toBe("string");
  });

  it("lerps paths with different command types", () => {
    // d3-interpolate-path can handle paths with different commands
    const a = <path d="M 0 0 L 10 10" />;
    const b = <path d="M 20 20 C 25 25 25 25 30 30" />;

    const result = lerpSvgx(a, b, 0.5);

    // Should produce a valid path
    expect(result.props.d).toBeTruthy();
    expect(typeof result.props.d).toBe("string");
  });

  it("fades unmatched trailing children (positional)", () => {
    const a = (
      <g>
        <rect x={0} />
      </g>
    );
    const b = (
      <g>
        <rect x={10} />
        <circle cx={5} />
      </g>
    );

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <g>
        <rect
          x={5}
        />
        <circle
          cx={5}
          opacity={0.5}
        />
      </g>
    `);
  });

  it("pairs keyed children by dragologyKey, not position", () => {
    const a = (
      <g>
        <rect dragologyKey="foo" x={0} />
        <circle dragologyKey="bar" cx={0} />
      </g>
    );
    // Reverse order in B — keys still pair correctly
    const b = (
      <g>
        <circle dragologyKey="bar" cx={100} />
        <rect dragologyKey="foo" x={100} />
      </g>
    );

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <g>
        <rect
          dragologyKey="foo"
          x={50}
        />
        <circle
          cx={50}
          dragologyKey="bar"
        />
      </g>
    `);
  });

  it("fades out a keyed child missing from B", () => {
    const a = (
      <g>
        <rect dragologyKey="a" x={0} />
        <rect dragologyKey="b" x={10} />
      </g>
    );
    const b = (
      <g>
        <rect dragologyKey="a" x={100} />
      </g>
    );

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <g>
        <rect
          dragologyKey="a"
          x={50}
        />
        <rect
          dragologyKey="b"
          opacity={0.5}
          x={10}
        />
      </g>
    `);
  });

  it("fades in a keyed child only present in B", () => {
    const a = (
      <g>
        <rect dragologyKey="a" x={0} />
      </g>
    );
    const b = (
      <g>
        <rect dragologyKey="a" x={100} />
        <rect dragologyKey="b" x={200} />
      </g>
    );

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <g>
        <rect
          dragologyKey="a"
          x={50}
        />
        <rect
          dragologyKey="b"
          opacity={0.5}
          x={200}
        />
      </g>
    `);
  });

  it("multiplies into existing opacity when fading", () => {
    const a = (
      <g>
        <rect dragologyKey="a" opacity={0.5} x={0} />
      </g>
    );
    const b = <g />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <g>
        <rect
          dragologyKey="a"
          opacity={0.25}
          x={0}
        />
      </g>
    `);
  });

  it("handles mixed keyed and unkeyed siblings", () => {
    const a = (
      <g>
        <rect x={0} />
        <circle dragologyKey="dot" cx={0} />
      </g>
    );
    const b = (
      <g>
        <circle dragologyKey="dot" cx={100} />
        <rect x={100} />
      </g>
    );

    // Unkeyed <rect>s pair positionally (one on each side); keyed circles pair
    // by key. Output preserves A's child order (rect, then circle).
    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <g>
        <rect
          x={50}
        />
        <circle
          cx={50}
          dragologyKey="dot"
        />
      </g>
    `);
  });

  it("preserves a matching string child inside <text>", () => {
    const a = <text x={0}>hello</text>;
    const b = <text x={100}>hello</text>;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <text
        x={50}
      >
        hello
      </text>
    `);
  });

  it("keeps A's string content when the two strings differ (can't lerp)", () => {
    const a = <text x={0}>foo</text>;
    const b = <text x={100}>bar</text>;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <text
        x={50}
      >
        foo
      </text>
    `);
  });

  it("handles string siblings alongside element siblings", () => {
    const a = (
      <text x={0}>
        hello<tspan fill="red">world</tspan>
      </text>
    );
    const b = (
      <text x={100}>
        hello<tspan fill="blue">world</tspan>
      </text>
    );

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`
      <text
        x={50}
      >
        hello
        <tspan
          fill="rgb(193, 0, 136)"
        >
          world
        </tspan>
      </text>
    `);
  });

  it("drops a string child that appears on only one side", () => {
    // String children can't be opacity-faded, so they're dropped when
    // unmatched (same behavior as pushFaded had).
    const a = <text>solo</text>;
    const b = <text />;

    const result = lerpSvgx(a, b, 0.5);

    expect(result).toMatchInlineSnapshot(`<text />`);
  });
});

describe("component elements", () => {
  function Gauge(_props: { value: number; label: string }) {
    return null;
  }

  it("blends listed props and snaps the rest", () => {
    const a = <Gauge value={0} label="a" dragologyLerpProps={["value"]} />;
    const b = <Gauge value={10} label="b" dragologyLerpProps={["value"]} />;
    const mid = lerpSvgx(a as any, b as any, 0.3);
    expect(mid.props).toMatchObject({ value: 3, label: "a" });
  });

  it("blends a component inside a foreignObject", () => {
    const a = (
      <foreignObject>
        <Gauge value={0} label="a" dragologyLerpProps={["value"]} />
      </foreignObject>
    );
    const b = (
      <foreignObject>
        <Gauge value={10} label="b" dragologyLerpProps={["value"]} />
      </foreignObject>
    );
    const mid = lerpSvgx(a as any, b as any, 0.3);
    expect((mid.props.children as any)[0].props.value).toBe(3);
  });

  it("warns once about a listed prop that doesn't exist", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = <Gauge value={0} label="a" dragologyLerpProps={["valeu"]} />;
    const b = <Gauge value={10} label="b" dragologyLerpProps={["valeu"]} />;
    lerpSvgx(a as any, b as any, 0.3);
    lerpSvgx(a as any, b as any, 0.6);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/<Gauge> lists "valeu"/);
    warn.mockRestore();
  });
});

describe("what can't be blended", () => {
  it("comes from the side named by unblendedFrom", () => {
    const a = <text x={0}>A</text>;
    const b = <text x={10}>B</text>;
    expect(lerpSvgx(a, b, 0.8, "a").props).toMatchObject({ x: 8 });
    expect(lerpSvgx(a, b, 0.8, "a").props.children).toEqual(["A"]);
    expect(lerpSvgx(a, b, 0.2, "b").props.children).toEqual(["B"]);
  });

  it("includes component props", () => {
    function Label(_props: { text: string }) {
      return null;
    }
    const a = <Label text="A" />;
    const b = <Label text="B" />;
    expect(lerpSvgx(a as any, b as any, 0.5, "b").props).toMatchObject({
      text: "B",
    });
  });

  it("comes from the nearest state in a weighted blend", () => {
    const render = (label: string) =>
      layerSvg(
        <g>
          <text id="label">{label}</text>
        </g>,
      );
    const items = [render("A"), render("B"), render("C")];
    // Folding pairwise in order and keeping the nearer side would end
    // up with B; C is nearest overall.
    const weights = new Map([
      [0, 0.2],
      [1, 0.35],
      [2, 0.45],
    ]);
    const label = lerpLayeredWeighted(items, weights).byId.get("label")!;
    expect(label.element.props.children).toEqual(["C"]);
  });
});
