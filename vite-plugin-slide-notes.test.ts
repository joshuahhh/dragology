import { describe, expect, it } from "vitest";
import { setNotes, setTimings } from "./vite-plugin-slide-notes";

const file = `
export const outline = [
  { heading: "Intro" },
  {
    transition: "fade",
    notes: \`
      old notes
    \`,
    content: <ImageSlide src="a.jpg" />,
  },
  {
    steps: 2,
    content: <ImageSlide src="b.jpg" />,
  },
];
`;

describe("setNotes", () => {
  it("replaces existing notes", () => {
    const out = setNotes(file, {
      index: 1,
      old: "\n      old notes\n    ",
      notes: "new\n\n- a `b` \\c ${d}",
    });
    expect(out).toContain(
      "    notes: `\n      new\n\n      - a \\`b\\` \\\\c \\${d}\n    `,\n",
    );
    expect(out).not.toContain("old notes");
  });

  it("adds notes before the content", () => {
    const out = setNotes(file, { index: 2, old: undefined, notes: "hi" });
    expect(out).toContain(
      "    steps: 2,\n    notes: `\n      hi\n    `,\n    content:",
    );
  });

  it("removes notes set to nothing", () => {
    const out = setNotes(file, {
      index: 1,
      old: "\n      old notes\n    ",
      notes: "  \n",
    });
    expect(out).toContain('    transition: "fade",\n    content:');
  });

  it("refuses when the notes changed in the file", () => {
    expect(() =>
      setNotes(file, { index: 1, old: "something else", notes: "x" }),
    ).toThrow(/changed/);
  });

  it("refuses an entry that isn't an object literal", () => {
    const calls = file.replace('{ heading: "Intro" }', 'heading("Intro")');
    expect(() =>
      setNotes(calls, { index: 0, old: undefined, notes: "x" }),
    ).toThrow(/object literal/);
  });
});

describe("setTimings", () => {
  it("adds timings before the notes or content, and replaces them", () => {
    const once = setTimings(file, {
      outlineLength: 3,
      slides: [
        { index: 1, timing: [12, 40] },
        { index: 2, timing: [7] },
      ],
    });
    expect(once).toContain(
      '    transition: "fade",\n    timing: [12, 40],\n    notes:',
    );
    expect(once).toContain("    steps: 2,\n    timing: [7],\n    content:");
    const twice = setTimings(once, {
      outlineLength: 3,
      slides: [{ index: 1, timing: [3, 4] }],
    });
    expect(twice).toContain("timing: [3, 4],");
    expect(twice).not.toContain("[12, 40]");
    expect(twice).toContain("timing: [7],");
  });

  it("refuses all when the outline's length changed", () => {
    expect(() =>
      setTimings(file, {
        outlineLength: 4,
        slides: [{ index: 1, timing: [1] }],
      }),
    ).toThrow(/added to or removed from the outline/);
  });
});
