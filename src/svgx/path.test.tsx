import { describe, expect, it } from "vitest";
import { assignPaths, findByPath, getPath } from "./path";

describe("assignPaths", () => {
  it("assigns numerical paths to nested elements", () => {
    const tree = (
      <g>
        <rect />
        <circle />
      </g>
    );

    expect(assignPaths(tree)).toMatchInlineSnapshot(`
      <g
        data-path="/"
      >
        <rect
          data-path="/0/"
        />
        <circle
          data-path="/1/"
        />
      </g>
    `);
  });

  it("handles deeply nested elements", () => {
    const tree = (
      <g>
        <g>
          <rect />
          <circle />
        </g>
      </g>
    );

    expect(assignPaths(tree)).toMatchInlineSnapshot(`
      <g
        data-path="/"
      >
        <g
          data-path="/0/"
        >
          <rect
            data-path="/0/0/"
          />
          <circle
            data-path="/0/1/"
          />
        </g>
      </g>
    `);
  });

  it("uses id when present", () => {
    const tree = (
      <g>
        <rect id="my-rect" />
        <circle />
      </g>
    );

    expect(assignPaths(tree)).toMatchInlineSnapshot(`
      <g
        data-path="/"
      >
        <rect
          data-path="my-rect/"
          id="my-rect"
        />
        <circle
          data-path="/1/"
        />
      </g>
    `);
  });

  it("id replaces the path and children append to it", () => {
    const tree = (
      <g>
        <g id="container">
          <rect />
          <circle />
        </g>
      </g>
    );

    expect(assignPaths(tree)).toMatchInlineSnapshot(`
      <g
        data-path="/"
      >
        <g
          data-path="container/"
          id="container"
        >
          <rect
            data-path="container/0/"
          />
          <circle
            data-path="container/1/"
          />
        </g>
      </g>
    `);
  });

  it("handles mixed id and relative paths", () => {
    const tree = (
      <g>
        <g>
          <rect id="special" />
          <circle />
        </g>
        <line />
      </g>
    );

    expect(assignPaths(tree)).toMatchInlineSnapshot(`
      <g
        data-path="/"
      >
        <g
          data-path="/0/"
        >
          <rect
            data-path="special/"
            id="special"
          />
          <circle
            data-path="/0/1/"
          />
        </g>
        <line
          data-path="/1/"
        />
      </g>
    `);
  });

  it("preserves existing props", () => {
    const tree = (
      <g className="my-class">
        <rect x={10} y={20} fill="red" />
      </g>
    );

    expect(assignPaths(tree)).toMatchInlineSnapshot(`
      <g
        className="my-class"
        data-path="/"
      >
        <rect
          data-path="/0/"
          fill="red"
          x={10}
          y={20}
        />
      </g>
    `);
  });

  it("throws error when id contains a slash", () => {
    const tree = (
      <g>
        <rect id="root/child" />
      </g>
    );

    expect(() => assignPaths(tree)).toThrow(
      'Element id "root/child" contains a slash, which is not allowed',
    );
  });

  it("throws error when id contains multiple slashes", () => {
    const tree = (
      <g>
        <rect id="a/b/c" />
      </g>
    );

    expect(() => assignPaths(tree)).toThrow(
      'Element id "a/b/c" contains a slash, which is not allowed',
    );
  });

  it("uses dragologyKey as the path step when present", () => {
    const tree = (
      <g>
        <rect dragologyKey="alpha" />
        <circle dragologyKey="beta" />
      </g>
    );

    expect(assignPaths(tree)).toMatchInlineSnapshot(`
      <g
        data-path="/"
      >
        <rect
          data-path="/alpha/"
          dragologyKey="alpha"
        />
        <circle
          data-path="/beta/"
          dragologyKey="beta"
        />
      </g>
    `);
  });

  it("unkeyed siblings are numbered by position among unkeyed only", () => {
    const tree = (
      <g>
        <rect />
        <circle dragologyKey="middle" />
        <line />
      </g>
    );

    // <line /> is the *second* unkeyed child, so it's "/1/" not "/2/".
    // This keeps path numbering consistent with how `lerpSvgx` pairs unkeyed
    // children by position among unkeyed.
    expect(assignPaths(tree)).toMatchInlineSnapshot(`
      <g
        data-path="/"
      >
        <rect
          data-path="/0/"
        />
        <circle
          data-path="/middle/"
          dragologyKey="middle"
        />
        <line
          data-path="/1/"
        />
      </g>
    `);
  });

  it("throws when sibling dragologyKey collides with an unkeyed sibling's index", () => {
    const tree = (
      <g>
        <rect />
        <circle dragologyKey="1" />
        <line />
      </g>
    );

    // <rect> takes unkeyed step "0"; <circle dragologyKey="1"> takes "1";
    // then <line /> as the second unkeyed child wants step "1" — collision.
    expect(() => assignPaths(tree)).toThrow(
      'Duplicate path step "1" among siblings',
    );
  });

  it("does NOT hoist dragologyKey — key is appended to the parent path", () => {
    const tree = (
      <g id="container">
        <rect dragologyKey="first" />
      </g>
    );

    expect(assignPaths(tree)).toMatchInlineSnapshot(`
      <g
        data-path="container/"
        id="container"
      >
        <rect
          data-path="container/first/"
          dragologyKey="first"
        />
      </g>
    `);
  });

  it("throws when dragologyKey contains a slash", () => {
    const tree = (
      <g>
        <rect dragologyKey="a/b" />
      </g>
    );

    expect(() => assignPaths(tree)).toThrow(
      'Element dragologyKey "a/b" contains a slash, which is not allowed',
    );
  });

  it("throws when sibling dragologyKeys collide", () => {
    const tree = (
      <g>
        <rect dragologyKey="dup" />
        <circle dragologyKey="dup" />
      </g>
    );

    expect(() => assignPaths(tree)).toThrow(
      'Duplicate path step "dup" among siblings',
    );
  });

  it("numbers unkeyed children independently of keyed ones, interleaved", () => {
    const tree = (
      <g>
        <rect dragologyKey="A" />
        <circle />
        <line dragologyKey="B" />
        <path />
        <ellipse dragologyKey="C" />
        <polygon />
      </g>
    );

    // Unkeyed get /0/, /1/, /2/ regardless of where keyed siblings sit.
    expect(assignPaths(tree)).toMatchInlineSnapshot(`
      <g
        data-path="/"
      >
        <rect
          data-path="/A/"
          dragologyKey="A"
        />
        <circle
          data-path="/0/"
        />
        <line
          data-path="/B/"
          dragologyKey="B"
        />
        <path
          data-path="/1/"
        />
        <ellipse
          data-path="/C/"
          dragologyKey="C"
        />
        <polygon
          data-path="/2/"
        />
      </g>
    `);
  });

  it('throws when dragologyKey "0" collides with the first unkeyed sibling', () => {
    // Ordering should not matter: even with the keyed child coming first,
    // the unkeyed sibling would claim step "0" and collide.
    const tree = (
      <g>
        <rect dragologyKey="0" />
        <circle />
      </g>
    );

    expect(() => assignPaths(tree)).toThrow(
      'Duplicate path step "0" among siblings',
    );
  });
});

describe("findByPath", () => {
  it("finds root element by path", () => {
    const tree = assignPaths(
      <g>
        <rect />
        <circle />
      </g>,
    );

    const found = findByPath("/", tree);
    expect.assert(found);
    expect(found.element.type).toBe("g");
    expect(getPath(found.element)).toBe("/");
  });

  it("finds child element by numerical path", () => {
    const tree = assignPaths(
      <g>
        <rect />
        <circle />
      </g>,
    );

    const found = findByPath("/1/", tree);
    expect.assert(found);
    expect(found.element.type).toBe("circle");
  });

  it("finds deeply nested element", () => {
    const tree = assignPaths(
      <g>
        <g>
          <rect />
          <circle />
        </g>
      </g>,
    );

    const found = findByPath("/0/1/", tree);
    expect.assert(found);
    expect(found.element.type).toBe("circle");
  });

  it("finds element by id-based path", () => {
    const tree = assignPaths(
      <g>
        <rect id="my-rect" />
        <circle />
      </g>,
    );

    const found = findByPath("my-rect/", tree);
    expect.assert(found);
    expect(found.element.type).toBe("rect");
    expect((found.element.props as any).id).toBe("my-rect");
  });

  it("finds nested child under id-based path", () => {
    const tree = assignPaths(
      <g>
        <g id="container">
          <rect />
          <circle />
        </g>
      </g>,
    );

    const found = findByPath("container/1/", tree);
    expect.assert(found);
    expect(found.element.type).toBe("circle");
  });

  it("returns null when path does not exist", () => {
    const tree = assignPaths(
      <g>
        <rect />
      </g>,
    );

    const found = findByPath("/99/", tree);
    expect(found).toBe(null);
  });

  it("returns null for non-existent id path", () => {
    const tree = assignPaths(
      <g>
        <rect id="real" />
      </g>,
    );

    const found = findByPath("fake/", tree);
    expect(found).toBe(null);
  });

  it("returns accumulated transform for nested element", () => {
    const tree = assignPaths(
      <g transform="translate(10, 20)">
        <g transform="rotate(45)">
          <rect id="r1" />
        </g>
      </g>,
    );

    const found = findByPath("r1/", tree);
    expect.assert(found);
    expect(found.accumulatedTransform).toBe("translate(10, 20) rotate(45)");
  });

  it("returns accumulated transform including element's own transform", () => {
    const tree = assignPaths(
      <g transform="translate(10, 20)">
        <rect id="r1" transform="scale(2)" />
      </g>,
    );

    const found = findByPath("r1/", tree);
    expect.assert(found);
    expect(found.accumulatedTransform).toBe("translate(10, 20) scale(2)");
  });

  it("returns empty accumulated transform for root with no transforms", () => {
    const tree = assignPaths(
      <g>
        <rect />
      </g>,
    );

    const found = findByPath("/", tree);
    expect.assert(found);
    expect(found.accumulatedTransform).toBe("");
  });
});

describe("component elements", () => {
  function Widget(_props: { id?: string }) {
    return null;
  }

  it("treats a component's id as its own prop", () => {
    const result = assignPaths(
      <g>
        <Widget id="x" />
      </g>,
    );
    const found = findByPath("/0/", result);
    expect(found?.element.type).toBe(Widget);
    expect(found?.element.props.id).toBe("x");
    expect(findByPath("x/", result)).toBeNull();
  });

  it("rejects dragologyKey on a component", () => {
    const Untyped = Widget as any;
    expect(() =>
      assignPaths(
        <g>
          <Untyped dragologyKey="w" />
        </g>,
      ),
    ).toThrow(/<Widget> has a dragologyKey/);
  });
});

describe("foreignObject", () => {
  function Widget() {
    return null;
  }

  it("may hold component elements", () => {
    const result = assignPaths(
      <foreignObject>
        <Widget />
      </foreignObject>,
    );
    expect(findByPath("/0/", result)?.element.type).toBe(Widget);
  });

  it("rejects inline HTML", () => {
    expect(() =>
      assignPaths(
        <foreignObject>
          <div />
        </foreignObject>,
      ),
    ).toThrow(/<foreignObject> contains <div>/);
  });
});
