import { describe, expect, it } from "vitest";
import { snippets } from "./snippets";
import { tsService } from "./tsService";

/** Completion names at `|` in `code`. */
function complete(code: string, prelude = "") {
  const pos = code.indexOf("|");
  tsService.update(prelude, code.slice(0, pos) + code.slice(pos + 1));
  return tsService.completions(pos)?.map((e) => e.name) ?? [];
}

const { prelude, code } = snippets[1];

describe("tsService", () => {
  it("completes the drag spec builder through draggable's props", () => {
    const at = code.indexOf("d.closest") + 2;
    const names = complete(code.slice(0, at) + "|" + code.slice(at), prelude);
    expect(names).toEqual(
      expect.arrayContaining(["closest", "between", "vary"]),
    );
  });

  it("completes spec methods", () => {
    const at = code.indexOf("reinsertions(state, idx))") + 25;
    const edited = code.slice(0, at) + ".|" + code.slice(at);
    expect(complete(edited, prelude)).toEqual(
      expect.arrayContaining(["withFloating", "whenFar"]),
    );
  });

  it("completes state from initialState", () => {
    const at = code.indexOf("state.beads.length") + 6;
    const names = complete(code.slice(0, at) + "|" + code.slice(at), prelude);
    expect(names).toContain("beads");
  });

  it("completes Dragology's SVG attributes", () => {
    const at = code.indexOf("<circle") + 7;
    const names = complete(
      code.slice(0, at) + " dr|" + code.slice(at),
      prelude,
    );
    expect(names).toContain("dragologyOnDrag");
  });

  it("completes names from the scope", () => {
    expect(complete("const v = Vec2.|")).toContain("polarDeg");
  });
});

describe("tsService diagnostics", () => {
  it("finds no errors in the snippets", () => {
    for (const s of snippets) {
      for (const { prelude, code } of [s, ...(s.bright ? [s.bright] : [])]) {
        tsService.update(prelude, code);
        expect(
          tsService
            .diagnostics()
            .map((d) => code.slice(d.from, d.to) + ": " + d.message),
          s.title,
        ).toEqual([]);
      }
    }
  });

  it("reports errors at their place in the code", () => {
    const code =
      "const initialState = { n: 1 };\nconst s: string = initialState.n;";
    tsService.update("const a = 1;", code);
    const [d] = tsService.diagnostics();
    expect(code.slice(d.from, d.to)).toBe("s");
    expect(d.message).toMatch(/not assignable/);
  });

  it("maps positions past draggable's hidden props type", () => {
    const code =
      "const initialState = { n: 1 };\nfunction draggable({ state, d }) {\n  const s: string = state.n;\n}";
    tsService.update("", code);
    const [d] = tsService.diagnostics();
    expect(code.slice(d.from, d.to)).toBe("s");
  });
});

describe("tsService hover", () => {
  it("shows types at a position", () => {
    const at = code.indexOf("d.closest");
    tsService.update(prelude, code);
    const hover = tsService.hover(at)!;
    expect(code.slice(hover.from, hover.to)).toBe("d");
    expect(hover.signature).toMatch(/DragSpecBuilder/);
  });

  it("documents a builder getter with its function's docs", () => {
    const at = code.indexOf("d.closest") + 2;
    tsService.update(prelude, code);
    expect(tsService.hover(at)!.documentation).toMatch(
      /closest to the pointer/,
    );
  });
});

describe("tsService details", () => {
  it("documents a builder getter with its function's docs", () => {
    const at = code.indexOf("d.closest") + 2;
    tsService.update(prelude, code);
    const entry = tsService.completions(at)!.find((e) => e.name === "closest")!;
    expect(tsService.details(at, entry)!.documentation).toMatch(
      /closest to the pointer/,
    );
  });
});
