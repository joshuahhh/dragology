import { normalizeIndent } from "../normalizeIndent";

export type Snippet = {
  title: string;
  /** Hidden helper code, run before `code`. */
  prelude: string;
  code: string;
  width: number;
  height: number;
  showState?: boolean;
  /** An alternate look, toggled with a shortcut. */
  bright?: { prelude: string; code: string };
};

// # Ring of beads

// Code is reformatted to the editor's width on load, so these templates
// only need to be valid, not pretty.

type BeadsLook = { prelude: string; ring: string; bead: string };

// The reachable states for a bead drag, as helpers after `draggable`, so
// the drag code reads as just the combinators while the SVG and the
// combinators stay on screen together.
const beadsStateHelpers = `
// every state with the bead at idx moved to some index
function reinsertions(state, idx) {
  return state.beads.map((_, targetIdx) => {
    const newState = structuredClone(state);
    const [bead] = newState.beads.splice(idx, 1);
    newState.beads.splice(targetIdx, 0, bead);
    return newState;
  });
}

// the state with the bead at idx taken out
function removed(state, idx) {
  const newState = structuredClone(state);
  newState.beads.splice(idx, 1);
  return newState;
}
`;

const beadsLooks: Record<"original" | "bright", BeadsLook> = {
  original: {
    prelude: normalizeIndent`
      const COLORS = { A: "#e8b4b8", B: "#b4d4e8", C: "#b8e8b4", D: "#e8d4b4", E: "#d4b4e8" };
      const radPos = (t: number) => Vec2.polarDeg(100, t * 360 - 90);
    `,
    ring: `<circle r={100} fill="none" stroke="#ddd" strokeWidth={2} />`,
    bead: normalizeIndent`
      <circle r={24} fill={COLORS[bead]} stroke="#999" strokeWidth={1.5} />
      <text textAnchor="middle" dominantBaseline="central" fontSize={16}>
        {bead}
      </text>
    `,
  },
  bright: {
    // Tailwind 300 / 600 / 700 shades: fill, edge, ink.
    prelude: normalizeIndent`
      const FILL = { A: "#fca5a5", B: "#93c5fd", C: "#fde047", D: "#86efac", E: "#c4b5fd" };
      const EDGE = { A: "#dc2626", B: "#2563eb", C: "#ca8a04", D: "#16a34a", E: "#7c3aed" };
      const INK = { A: "#b91c1c", B: "#1d4ed8", C: "#a16207", D: "#15803d", E: "#6d28d9" };
      const radPos = (t: number) => Vec2.polarDeg(100, t * 360 - 90);
    `,
    ring: `<circle r={100} fill="none" stroke="#e4e4e7" strokeWidth={30} />`,
    bead: normalizeIndent`
      <circle r={27} fill={FILL[bead]} stroke={EDGE[bead]} strokeWidth={2} />
      <text textAnchor="middle" dominantBaseline="central"
        fontSize={32} fontWeight={800} fill={INK[bead]}>
        {bead}
      </text>
    `,
  },
};

/** `spec` is the drag spec expression, or null for no drag. */
function beadsCode(look: BeadsLook, spec: string | null): string {
  const dragAttr = spec ? `dragologyOnDrag={() => ${spec}}` : "";
  return `const initialState = { beads: ["A", "B", "C", "D", "E"] };

function draggable({ state, d }) {
  const n = state.beads.length;
  return (
    <g transform={translate(150, 150)}>
      ${look.ring}
      {state.beads.map((bead, idx) => (
        <g id={bead} transform={translate(radPos(idx / n))} ${dragAttr}>
          ${look.bead}
        </g>
      ))}
    </g>
  );
}
${spec ? beadsStateHelpers : ""}`;
}

function beadsSnippet(title: string, spec: string | null): Snippet {
  return {
    title,
    prelude: beadsLooks.original.prelude,
    code: beadsCode(beadsLooks.original, spec),
    bright: {
      prelude: beadsLooks.bright.prelude,
      code: beadsCode(beadsLooks.bright, spec),
    },
    width: 300,
    height: 300,
  };
}

const allSnippets: Snippet[] = [
  beadsSnippet("ring of beads: static", null),
  beadsSnippet("ring of beads: closest", "d.closest(reinsertions(state, idx))"),
  beadsSnippet(
    "ring of beads: floating",
    "d.closest(reinsertions(state, idx)).withFloating()",
  ),
  beadsSnippet(
    "ring of beads: whenFar",
    `d.closest(reinsertions(state, idx))
      .whenFar(d.fixed(removed(state, idx)).onDrop(state), { gap: 65 })
      .withFloating()`,
  ),
];

// No trailing newline: it would show as a blank last line in the editor.
export const snippets: Snippet[] = allSnippets.map((s) => ({
  ...s,
  code: s.code.trimEnd(),
  bright: s.bright && { ...s.bright, code: s.bright.code.trimEnd() },
}));
