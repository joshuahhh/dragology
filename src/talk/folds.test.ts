import { javascript } from "@codemirror/lang-javascript";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { stylingFoldRanges } from "./folds";

function folded(code: string): string {
  const state = EditorState.create({
    doc: code,
    extensions: [javascript({ jsx: true, typescript: true })],
  });
  let out = code;
  for (const { from, to } of stylingFoldRanges(state).reverse()) {
    out = out.slice(0, from) + " … " + out.slice(to);
  }
  return out;
}

describe("stylingFoldRanges", () => {
  it("folds styling attributes but keeps structural ones", () => {
    expect(
      folded(`const x = (
 <g
  id={bead}
  transform={t}
  dragologyOnDrag={() => s}
 >
  <circle
   r={27}
   fill={FILL[bead]}
  />
  <text
   fontSize={32}
   fill={INK[bead]}
  >
   {bead}
  </text>
 </g>
);`),
    ).toBe(`const x = (
 <g
  id={bead}
  transform={t}
  dragologyOnDrag={() => s}
 >
  <circle … />
  <text … >
   {bead}
  </text>
 </g>
);`);
  });

  it("folds runs between structural attributes", () => {
    expect(folded(`<g fill="red" id="a" stroke="b" />`)).toBe(
      `<g … id="a" … />`,
    );
  });
});
