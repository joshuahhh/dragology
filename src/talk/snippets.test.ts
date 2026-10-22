import { describe, expect, it } from "vitest";
import { renderDraggableInert } from "../renderDraggable";
import { compileLiveCode } from "./compile";
import { formatCode, minimalChange } from "./format";
import { snippets } from "./snippets";

const variants = snippets.flatMap((s) => [
  { name: s.title, prelude: s.prelude, code: s.code },
  ...(s.bright ? [{ name: `${s.title} (bright)`, ...s.bright }] : []),
]);

describe("snippets", () => {
  it.each(variants)("$name compiles and renders", ({ prelude, code }) => {
    const compiled = compileLiveCode(code, prelude);
    renderDraggableInert(
      compiled.draggable,
      compiled.initialState,
      null,
      false,
    );
  });

  it.each(variants)(
    "$name still compiles after formatting narrow",
    async ({ prelude, code }) => {
      const { formatted } = await formatCode(code, 0, 40);
      expect(formatted).toMatch(/^ {1}\S/m); // one-space indents
      compileLiveCode(formatted, prelude);
    },
  );
});

describe("minimalChange", () => {
  it("replaces only the differing middle", () => {
    expect(minimalChange("abcXdef", "abcYYdef")).toEqual({
      from: 3,
      to: 4,
      insert: "YY",
    });
    expect(minimalChange("same", "same")).toEqual({
      from: 4,
      to: 4,
      insert: "",
    });
  });
});
