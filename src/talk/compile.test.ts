import { describe, expect, it } from "vitest";
import { compileLiveCode, instrumentJsx } from "./compile";

describe("instrumentJsx", () => {
  it("tags lowercase elements with their source ranges", () => {
    const code = `const x = <g a={1}><circle r={2} /></g>;`;
    const { code: out, locs } = instrumentJsx(code);
    expect(out).toBe(
      `const x = <g data-loc="0" a={1}><circle data-loc="1" r={2} /></g>;`,
    );
    expect(locs.map((l) => code.slice(l.from, l.to))).toEqual([
      `<g a={1}><circle r={2} /></g>`,
      `<circle r={2} />`,
    ]);
    expect(locs[0].tags.map((t) => code.slice(t.from, t.to))).toEqual([
      `<g a={1}>`,
      `</g>`,
    ]);
  });

  it("skips components and fragments", () => {
    const { locs } = instrumentJsx(`const x = <><Foo><rect /></Foo></>;`);
    expect(locs).toHaveLength(1);
  });
});

describe("compileLiveCode", () => {
  it("evaluates TSX with types and returns locs", () => {
    const compiled = compileLiveCode(`
      type State = { n: number };
      const initialState: State = { n: 3 };
      const draggable = ({ state }: { state: State }) => (
        <g transform={translate(1, 2)}>{state.n}</g>
      );
    `);
    expect(compiled.initialState).toEqual({ n: 3 });
    expect(compiled.locs).toHaveLength(1);
  });

  it("reports syntax errors by line, ignoring the prelude", () => {
    expect(() =>
      compileLiveCode(`const a = 1;\nconst b = );`, `const p = 1;\n`),
    ).toThrow(/\(line 2\)$/);
  });

  it("reports missing definitions", () => {
    expect(() => compileLiveCode(`const initialState = {};`)).toThrow();
  });
});
