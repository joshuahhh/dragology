import { describe, expect, it } from "vitest";
import { childrenToArray, findElement, updatePropsDownTree } from ".";

describe("findElement", () => {
  it("accumulates transforms through nested groups", () => {
    const tree = (
      <g transform="translate(10, 20)">
        <g transform="rotate(45)">
          <rect id="target" />
        </g>
      </g>
    );

    const found = findElement(tree, (el) => el.props.id === "target");
    expect.assert(found);
    expect(found.element.type).toBe("rect");
    expect(found.accumulatedTransform).toBe("translate(10, 20) rotate(45)");
  });

  it("includes the matched element's own transform", () => {
    const tree = (
      <g transform="translate(10, 20)">
        <rect id="target" transform="scale(2)" />
      </g>
    );

    const found = findElement(tree, (el) => el.props.id === "target");
    expect.assert(found);
    expect(found.accumulatedTransform).toBe("translate(10, 20) scale(2)");
  });

  it("returns empty string when no transforms exist", () => {
    const tree = (
      <g>
        <rect id="target" />
      </g>
    );

    const found = findElement(tree, (el) => el.props.id === "target");
    expect.assert(found);
    expect(found.accumulatedTransform).toBe("");
  });

  it("returns null when no element matches", () => {
    const tree = (
      <g>
        <rect id="other" />
      </g>
    );

    const found = findElement(tree, (el) => el.props.id === "nope");
    expect(found).toBe(null);
  });

  it("accumulates transform when matching the root element", () => {
    const tree = <g transform="translate(5, 5)" />;

    const found = findElement(tree, (el) => el.type === "g");
    expect.assert(found);
    expect(found.accumulatedTransform).toBe("translate(5, 5)");
  });
});

describe("childrenToArray", () => {
  it("keeps keys from an earlier pass", () => {
    const once = childrenToArray([<rect />, [<circle />, <g />]]);
    expect(once.map((el: any) => el.key)).toEqual([".0", ".1:0", ".1:1"]);
    const twice = childrenToArray(once);
    expect(twice.map((el: any) => el.key)).toEqual([".0", ".1:0", ".1:1"]);
  });

  it("rejects author keys", () => {
    expect(() =>
      updatePropsDownTree(
        <g>
          {["a", "b"].map((k) => (
            <rect key={k} />
          ))}
        </g>,
        () => ({}),
      ),
    ).toThrow(/key prop \(a\)/);
  });
});
