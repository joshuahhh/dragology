import { demo } from "../../demo";
import { DemoDraggable, DemoLink, DemoNotes } from "../../demo/ui";
import { Draggable } from "../../draggable";
import { DragSpec, lessThan, moreThan, param } from "../../DragSpec";
import { Vec2 } from "../../math/vec2";
import { altKey } from "../../modifierKeys";
import { rotateDeg, translate } from "../../svgx/helpers";
import {
  Cubic,
  angleOf,
  bez,
  bezTan,
  cubicLen,
  dot,
  paramAtLen,
  sub,
  subCubic,
} from "./geometry";
import {
  Knot,
  Move,
  arcOfEdge,
  cleanup,
  edgeCubics,
  edgeIndex,
  invariants,
  isValid,
  movesAt,
} from "./knot";
import { figureEight, trefoil, unknot } from "./presets";
import tangles from "./tangles.json";

const WIDTH = 560;
const HEIGHT = 470;
const STROKE = 5;
const GAP = 4; // white gap on each side of an over-strand
const BRIDGE = 13; // length of the over-strand bridge on each side of a crossing

const PALETTE = ["#e11d48", "#2563eb", "#16a34a"];
const MONO = "#334155";

/** Build a preset once. */
function memo(f: () => Knot): () => Knot {
  let cached: Knot | undefined;
  return () => (cached ??= f());
}

const presets: { label: string; make: () => Knot }[] = [
  { label: "tangle A", make: () => tangles.A as Knot },
  { label: "tangle B", make: () => tangles.B as Knot },
  { label: "trefoil", make: memo(trefoil) },
  { label: "figure-eight", make: memo(figureEight) },
  { label: "unknot", make: memo(unknot) },
];

const initialState: Knot = presets[0].make();

const f1 = (n: number) => n.toFixed(2);
const cubicD = (c: Cubic) =>
  `M${f1(c[0].x)},${f1(c[0].y)} C${f1(c[1].x)},${f1(c[1].y)} ${f1(c[2].x)},${f1(c[2].y)} ${f1(c[3].x)},${f1(c[3].y)}`;

/** The last `L` px of cubic c, then the first `L` px of cubic d. */
function bridgeD(c: Cubic, d: Cubic): string {
  const lc = cubicLen(c);
  const ld = cubicLen(d);
  const a = subCubic(
    c,
    lc > 0 ? paramAtLen(c, Math.max(0, lc - BRIDGE)) : 1,
    1,
  );
  const b = subCubic(d, 0, ld > 0 ? paramAtLen(d, Math.min(ld, BRIDGE)) : 0);
  return (
    cubicD(a) +
    ` C${f1(b[1].x)},${f1(b[1].y)} ${f1(b[2].x)},${f1(b[2].y)} ${f1(b[3].x)},${f1(b[3].y)}`
  );
}

/** Midpoint of edge e, where its drag handle sits. */
function edgeMid(k: Knot, e: string) {
  return bez(edgeCubics(k)[edgeIndex(k, e)], 0.5);
}

/** Keep only states whose drawing is exactly their code. */
function clampValid(start: Knot) {
  let lastGood = start;
  return (s: Knot) => {
    if (isValid(s)) {
      lastGood = s;
      return s;
    }
    return lastGood;
  };
}

const draggable: Draggable<Knot> = ({ state, d, draggedId, setState }) => {
  const inv = invariants(state);
  const cubics = edgeCubics(state);
  const V = state.code.length;

  const colorOfArc = (arc: string) =>
    inv.tricolorable ? PALETTE[inv.arcColor.get(arc) ?? 0] : MONO;
  const edgeColor = state.code.map((_, i) => colorOfArc(arcOfEdge(state, i)));

  const marker = bez(cubics[0], 0.5);
  const markerAngle = (angleOf(bezTan(cubics[0], 0.5)) * 180) / Math.PI;

  const edgeSpec = (e: string, i: number): DragSpec<Knot> =>
    d.reactTo(altKey, (under) => {
      const moves = movesAt(state, e, under);
      // Free dragging bends this edge: its two handle lengths and the
      // rotations of its end nodes.
      const n1 = state.code[i].n;
      const n2 = state.code[(i + 1) % V].n;
      const rots = n1 === n2 ? [n1] : [n1, n2];
      const cosmetic = d
        .vary(
          state,
          [
            param("edges", e, "a"),
            param("edges", e, "b"),
            ...rots.map((n) => param<Knot>("nodes", n, "rot")),
          ],
          {
            // Keep bends tame: handles no longer than the chord plus a
            // loop's worth, and end nodes turning at most 60°.
            constraint: (s) => {
              const p1 = s.nodes[n1];
              const p2 = s.nodes[n2];
              const maxH = Math.hypot(p1.x - p2.x, p1.y - p2.y) + 70;
              return [
                moreThan(s.edges[e].a, 3),
                moreThan(s.edges[e].b, 3),
                lessThan(s.edges[e].a, maxH),
                lessThan(s.edges[e].b, maxH),
                ...rots.map((n) =>
                  lessThan(
                    Math.abs(s.nodes[n].rot - state.nodes[n].rot),
                    Math.PI / 3,
                  ),
                ),
              ];
            },
          },
        )
        .during(clampValid(state));
      return d
        .closest(moves.map((m) => moveSpec(m, e)))
        .whenFar(cosmetic, { gapIn: 12, gapOut: 28 });
    });

  /**
   * A move interpolates from its start to its result. Past the result,
   * the pointer is slid back along the move's direction, so
   * overshooting a target keeps the move rather than dropping out of
   * it (only sideways distance counts as being "far").
   */
  const moveSpec = (m: Move, e: string): DragSpec<Knot> => {
    const A = edgeMid(m.from, e);
    const B = edgeMid(m.to, e);
    const AB = sub(B, A);
    const L2 = dot(AB, AB) || 1;
    return d.between([m.from, m.to]).changeFrame((frame) => {
      const p = frame.pointer;
      const t = ((p.x - A.x) * AB.x + (p.y - A.y) * AB.y) / L2;
      if (t <= 1) return {};
      return { pointer: p.sub(Vec2(AB.x * (t - 1), AB.y * (t - 1))) };
    });
  };

  const nodeSpec = (n: string): DragSpec<Knot> =>
    d
      .vary(state, [param("nodes", n, "x"), param("nodes", n, "y")])
      .during(clampValid(state));

  return (
    <g>
      <style>{`
        .knot-preset:hover rect { fill: #e2e8f0; }
        .knot-handle:hover { fill: rgba(15, 23, 42, 0.12); }
      `}</style>

      {/* edges: one cubic each */}
      {state.code.map((v, i) => (
        <path
          id={`edge-${v.e}`}
          d={cubicD(cubics[i])}
          fill="none"
          stroke={edgeColor[i]}
          strokeWidth={STROKE}
          strokeLinecap="round"
          style={{ pointerEvents: "none" }}
        />
      ))}

      {/* over-strand bridges: a white halo cuts the under-strand, then
          the over-strand is redrawn on top */}
      {state.code.map((v, i) => {
        if (!v.over || state.nodes[v.n].kind !== "x") return null;
        const inIdx = (i - 1 + V) % V;
        const dPath = bridgeD(cubics[inIdx], cubics[i]);
        return (
          <g
            id={`bridge-${v.n}`}
            dragologyZIndex={1}
            style={{ pointerEvents: "none" }}
          >
            <path
              d={dPath}
              fill="none"
              stroke="white"
              strokeWidth={STROKE + 2 * GAP}
              strokeLinecap="butt"
            />
            <path
              d={dPath}
              fill="none"
              stroke={edgeColor[i]}
              strokeWidth={STROKE}
              strokeLinecap="butt"
            />
          </g>
        );
      })}

      {/* orientation marker */}
      <path
        id="orientation"
        dragologyZIndex={1}
        transform={translate(marker) + rotateDeg(markerAngle)}
        d="M-4,-5 L5,0 L-4,5 Z"
        fill="white"
        stroke={edgeColor[0]}
        strokeWidth={1.5}
        style={{ pointerEvents: "none" }}
      />

      {/* edge handles, at each edge's midpoint */}
      {state.code.map((v, i) => {
        const id = `h-${v.e}`;
        return (
          <circle
            id={id}
            className="knot-handle"
            dragologyZIndex={2}
            transform={translate(bez(cubics[i], 0.5))}
            r={draggedId === id ? 7 : 10}
            fill={draggedId === id ? "rgba(15, 23, 42, 0.25)" : "transparent"}
            style={{ cursor: "grab" }}
            dragologyOnDrag={() => edgeSpec(v.e, i)}
          />
        );
      })}

      {/* node handles */}
      {Object.entries(state.nodes).map(([n, nd]) => {
        const id = `node-${n}`;
        return (
          <circle
            id={id}
            className="knot-handle"
            dragologyZIndex={3}
            transform={translate(nd.x, nd.y)}
            r={draggedId === id ? 7 : 9}
            fill={draggedId === id ? "rgba(15, 23, 42, 0.25)" : "transparent"}
            style={{ cursor: "move" }}
            dragologyOnDrag={() => nodeSpec(n)}
          />
        );
      })}

      {/* invariants */}
      <g
        transform={translate(16, HEIGHT - 58)}
        style={{ pointerEvents: "none" }}
      >
        <text fontSize={13} fill="#64748b" fontFamily="ui-monospace, monospace">
          {`crossings ${inv.n}   writhe ${inv.writhe >= 0 ? "+" : ""}${inv.writhe}   ${
            inv.tricolorable ? "tricolorable" : "not tricolorable"
          }`}
        </text>
        <text
          y={22}
          fontSize={15}
          fill="#0f172a"
          fontFamily="ui-monospace, monospace"
        >
          {`Jones  V(t) = ${inv.jones ?? "(too many crossings)"}`}
        </text>
      </g>

      {/* presets */}
      {presets.map((preset, k) => {
        const w = 16 + preset.label.length * 6.5;
        let x = WIDTH - 12;
        for (let j = presets.length - 1; j >= k; j--) {
          x -= 16 + presets[j].label.length * 6.5 + 6;
        }
        return (
          <g
            id={`preset-${preset.label}`}
            className="knot-preset"
            transform={translate(x, 14)}
            style={{ cursor: "pointer" }}
            onClick={() => setState(preset.make())}
          >
            <rect
              width={w}
              height={24}
              rx={6}
              fill="#f1f5f9"
              stroke="#cbd5e1"
            />
            <text
              x={w / 2}
              y={16}
              textAnchor="middle"
              fontSize={12}
              fill="#334155"
              fontFamily="ui-sans-serif, system-ui"
            >
              {preset.label}
            </text>
          </g>
        );
      })}
    </g>
  );
};

export default demo(
  () => (
    <div>
      <DemoNotes>
        A knot diagram you can manipulate by{" "}
        <DemoLink href="https://en.wikipedia.org/wiki/Reidemeister_move">
          Reidemeister moves
        </DemoLink>
        . Each strand between two crossings is a single curve. Grab one by its
        middle: pull it sideways to twist out a loop (R1), push it across a
        neighboring strand (R2; hold <kbd>Alt</kbd> to pass under), or slide it
        across a crossing (R3). Drag a loop back into the strand or a bigon back
        across its partner to undo. Drag in other directions to bend the strand,
        or drag a crossing to move it. The Jones polynomial never changes;
        crossing number and writhe do. Tangle A is the{" "}
        <DemoLink href="https://en.wikipedia.org/wiki/Hard_unknot">
          Culprit
        </DemoLink>
        , an unknot that can't be simplified until you first make it worse.
        Tangle B is a trefoil in disguise.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={WIDTH}
        height={HEIGHT}
        transformDropState={cleanup}
      />
    </div>
  ),
  {
    tags: [
      "d.between",
      "d.closest",
      "d.vary",
      "d.reactTo",
      "spec.whenFar",
      "spec.during",
      "math",
    ],
  },
);
