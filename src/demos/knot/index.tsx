import { useState } from "react";
import { demo } from "../../demo";
import { DemoDraggable, DemoLink, DemoNotes } from "../../demo/ui";
import { Draggable } from "../../draggable";
import { DragSpec, lessThan, moreThan, param } from "../../DragSpec";
import { Vec2 } from "../../math/vec2";
import { altKey } from "../../modifierKeys";
import { path, rotateDeg, translate } from "../../svgx/helpers";
import {
  Cubic,
  bez,
  bezTan,
  cubicLen,
  distToSegment,
  paramAtLen,
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
const OVERSHOOT = 40; // a move stays in play this far past its result
const PUSH_ENGAGE = 20; // a push engages this far short of the strand it crosses

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

const HISTORY = 100;

/**
 * Same diagram and geometry, up to numerical noise (a bend released
 * where it started comes back a hair off from the optimizer).
 */
function sameKnot(a: Knot, b: Knot): boolean {
  if (JSON.stringify(a.code) !== JSON.stringify(b.code)) return false;
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-3;
  const sameRecord = <V extends object>(
    ra: Record<string, V>,
    rb: Record<string, V>,
    fields: (keyof V)[],
  ) =>
    Object.keys(ra).length === Object.keys(rb).length &&
    Object.entries(ra).every(
      ([id, va]) =>
        rb[id] &&
        fields.every((f) => close(va[f] as number, rb[id][f] as number)),
    );
  return (
    sameRecord(a.nodes, b.nodes, ["x", "y", "rot"]) &&
    sameRecord(a.edges, b.edges, ["a", "b"])
  );
}

const cubicD = (c: Cubic) => path("M", c[0], "C", c[1], c[2], c[3]);

/** The last `BRIDGE` px of cubic c, then the first `BRIDGE` px of cubic d. */
function bridgeD(c: Cubic, d: Cubic): string {
  const lc = cubicLen(c);
  const ld = cubicLen(d);
  const a = subCubic(
    c,
    lc > 0 ? paramAtLen(c, Math.max(0, lc - BRIDGE)) : 1,
    1,
  );
  const b = subCubic(d, 0, ld > 0 ? paramAtLen(d, Math.min(ld, BRIDGE)) : 0);
  return path("M", a[0], "C", a[1], a[2], a[3], "C", b[1], b[2], b[3]);
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

const draggable: Draggable<Knot> = ({ state, d, draggedId }) => {
  const inv = invariants(state);
  const cubics = edgeCubics(state);
  const V = state.code.length;

  const colorOfArc = (arc: string) =>
    inv.tricolorable ? PALETTE[inv.arcColor.get(arc) ?? 0] : MONO;
  const edgeColor = state.code.map((_, i) => colorOfArc(arcOfEdge(state, i)));

  const marker = bez(cubics[0], 0.5);
  const markerAngle = bezTan(cubics[0], 0.5).angleDeg();

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
              const maxH = Vec2(p1).dist(p2) + 70;
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
      // Twists are rarely wanted, so they don't claim a direction of
      // the drag: each is a small target ring, and only snaps in when
      // the pointer reaches it. Everything else bends the strand.
      const twists = moves.filter((m) => m.kind === "R1");
      const others = moves.filter((m) => m.kind !== "R1");
      const spec = d
        .closest([
          ...others.map((m) => moveSpec(m, e)),
          ...twists.map((m) => d.fixed(m.to)),
        ])
        .whenFar(cosmetic, { gapIn: 12, gapOut: 28 });
      // (dropping merges the moves' pass nodes back into single curves)
      return spec.onDrop(cleanup).withOverlay(
        <g>
          {twists.map((m, k) => (
            <circle
              id={`twist-target-${k}`}
              transform={translate(edgeMid(m.to, e))}
              r={6}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
          ))}
        </g>,
      );
    });

  /**
   * A move interpolates from its start to its result, and is in play
   * within a capsule along that path: from where it engages (its start,
   * or for a push, just short of the strand it crosses) to a little
   * past its result. Past the result, the pointer is slid back along
   * the move's direction, so overshooting keeps the move.
   */
  const moveSpec = (m: Move, e: string): DragSpec<Knot> => {
    const A = edgeMid(m.from, e);
    const B = edgeMid(m.to, e);
    const len = A.dist(B) || 1;
    const dir = B.sub(A).div(len);
    const start = m.meets ? m.meets.sub(dir.mul(PUSH_ENGAGE)) : A;
    const end = B.add(dir.mul(OVERSHOOT));
    let pointer = A;
    return d
      .between([m.from, m.to])
      .changeFrame((frame) => {
        pointer = frame.pointer;
        const past = pointer.sub(B).dot(dir);
        return past > 0 ? { pointer: pointer.sub(dir.mul(past)) } : {};
      })
      .changeResult(() => ({ gap: distToSegment(pointer, start, end) }));
  };

  const nodeSpec = (n: string): DragSpec<Knot> =>
    d
      .vary(state, [param("nodes", n, "x"), param("nodes", n, "y")])
      .during(clampValid(state));

  return (
    <g>
      <style>{`
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
        const nd = state.nodes[v.n];
        // a pass node standing in for a crossing that's about to appear
        // or just went away draws a collapsed bridge (no gap), so the gap
        // moves into place instead of fading
        const ghost = nd.kind === "p" ? nd.ghostOf : undefined;
        if (!ghost && (!v.over || nd.kind !== "x")) return null;
        const inIdx = (i - 1 + V) % V;
        // (a stand-in is an invisible point: it travels with the strand
        // and fades in as it grows into the crossing's bridge)
        const p = cubics[i][0];
        const dPath = ghost
          ? path("M", p, "C", p, p, p, "C", p, p, p)
          : bridgeD(cubics[inIdx], cubics[i]);
        return (
          <g
            id={`bridge-${ghost ?? v.n}`}
            opacity={ghost ? 0 : 1}
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
    </g>
  );
};

// # Legend

const LEGEND_INK = "#334155";
const LEGEND_DRAG = "#ea580c";

/** A strand in a legend picture; over-strands get a white halo so
 * whatever they cross shows a gap. */
function LegendStrand({ d, over }: { d: string; over?: boolean }) {
  return (
    <g>
      {over && <path d={d} fill="none" stroke="white" strokeWidth={9} />}
      <path
        d={d}
        fill="none"
        stroke={LEGEND_INK}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </g>
  );
}

/** The dragged handle, with a dashed arrow to where it goes. */
function LegendDrag({
  from,
  to,
}: {
  from: [number, number];
  to?: [number, number];
}) {
  let arrow = null;
  if (to) {
    const [x1, y1] = from;
    const [x2, y2] = to;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const head = `M${x2},${y2} L${x2 - 7 * ux - 4 * uy},${y2 - 7 * uy + 4 * ux} L${x2 - 7 * ux + 4 * uy},${y2 - 7 * uy - 4 * ux} Z`;
    arrow = (
      <g>
        <line
          x1={x1}
          y1={y1}
          x2={x2 - 6 * ux}
          y2={y2 - 6 * uy}
          stroke={LEGEND_DRAG}
          strokeWidth={2}
          strokeDasharray="4 3"
        />
        <path d={head} fill={LEGEND_DRAG} />
      </g>
    );
  }
  return (
    <g>
      {arrow}
      <circle cx={from[0]} cy={from[1]} r={4.5} fill={LEGEND_DRAG} />
    </g>
  );
}

function LegendPicture({ children }: { children: React.ReactNode }) {
  return (
    <svg width={80} height={62} viewBox="0 0 80 62" className="shrink-0">
      {children}
    </svg>
  );
}

const legendMoves: {
  title: string;
  before: React.ReactNode;
  after: React.ReactNode;
  caption: React.ReactNode;
}[] = [
  {
    title: "Twist (R1)",
    before: (
      <>
        <LegendStrand d="M4,46 C30,46 50,46 76,46" />
        <circle
          cx={40}
          cy={10}
          r={5}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1.5}
        />
        <LegendDrag from={[40, 46]} to={[40, 17]} />
      </>
    ),
    after: (
      <>
        <LegendStrand d="M4,46 C18,46 32,44 40,38 C50,30 58,18 50,10 C43,3 30,6 29,14" />
        <LegendStrand d="M29,14 C28,22 33,32 40,38 C47,44 62,46 76,46" over />
        <LegendDrag from={[42, 6]} />
      </>
    ),
    caption: (
      <>
        Drag a strand onto one of the small rings beside it to make a loop. Drag
        the loop back in to undo.
      </>
    ),
  },
  {
    title: "Push (R2)",
    before: (
      <>
        <LegendStrand d="M4,44 C30,44 50,44 76,44" />
        <LegendStrand d="M4,16 C30,16 50,16 76,16" />
        <LegendDrag from={[40, 16]} to={[40, 56]} />
      </>
    ),
    after: (
      <>
        <LegendStrand d="M4,44 C30,44 50,44 76,44" />
        <LegendStrand d="M4,16 C24,16 26,56 40,56 C54,56 56,16 76,16" over />
        <LegendDrag from={[40, 56]} />
      </>
    ),
    caption: (
      <>
        Push a strand across a neighbor (hold <kbd>Alt</kbd> to go under). Drag
        it back to undo.
      </>
    ),
  },
  {
    title: "Slide (R3)",
    before: (
      <>
        <LegendStrand d="M12,6 L68,58" />
        <LegendStrand d="M68,6 L12,58" over />
        <LegendStrand d="M4,18 L76,18" over />
        <LegendDrag from={[40, 18]} to={[40, 48]} />
      </>
    ),
    after: (
      <>
        <LegendStrand d="M12,6 L68,58" />
        <LegendStrand d="M68,6 L12,58" over />
        <LegendStrand d="M4,46 L76,46" over />
        <LegendDrag from={[40, 46]} />
      </>
    ),
    caption: (
      <>
        A strand over (or under) both sides of a triangle slides across the
        crossing opposite it.
      </>
    ),
  },
];

function MoveLegend() {
  return (
    <div className="flex flex-wrap gap-3 mt-3">
      {legendMoves.map((m) => (
        <div
          key={m.title}
          className="flex-1 min-w-[170px] rounded-lg border border-gray-200 bg-white p-2"
        >
          <div className="text-xs font-semibold text-gray-700 mb-1">
            {m.title}
          </div>
          <div className="flex items-center justify-center gap-1">
            <LegendPicture>{m.before}</LegendPicture>
            <span className="text-gray-400 text-lg">→</span>
            <LegendPicture>{m.after}</LegendPicture>
          </div>
          <div className="text-xs text-gray-500 mt-1 leading-snug">
            {m.caption}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The demo owns the diagram and its undo history; the draggable only
 * ever sees the diagram.
 */
function KnotDemo() {
  const [knot, setKnot] = useState(() => presets[0].make());
  const [past, setPast] = useState<Knot[]>([]);

  const change = (next: Knot) => {
    if (!sameKnot(next, knot)) setPast([...past, knot].slice(-HISTORY));
    setKnot(next);
  };
  const undo = () => {
    setKnot(past[past.length - 1]);
    setPast(past.slice(0, -1));
  };

  const buttonClass =
    "px-2.5 py-1 text-xs rounded-md border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100";
  return (
    <div>
      <div
        className="flex flex-wrap justify-between gap-2 mb-2"
        style={{ maxWidth: WIDTH }}
      >
        <button
          className={buttonClass}
          onClick={undo}
          disabled={past.length === 0}
        >
          ↶ undo
        </button>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.label}
              className={buttonClass}
              onClick={() => change(preset.make())}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <DemoDraggable
        draggable={draggable}
        state={knot}
        onDropState={change}
        width={WIDTH}
        height={HEIGHT}
      />
    </div>
  );
}

export default demo(
  () => (
    <div>
      <DemoNotes>
        A knot diagram you can manipulate by{" "}
        <DemoLink href="https://en.wikipedia.org/wiki/Reidemeister_move">
          Reidemeister moves
        </DemoLink>
        . Each strand between two crossings is a single curve. Grab one by its
        middle: drag it onto a ring beside it to twist a loop (R1), push it
        across a neighboring strand (R2; hold <kbd>Alt</kbd> to pass under), or
        slide it across a crossing (R3). Drag a loop back into the strand or a
        bigon back across its partner to undo. Drag in other directions to bend
        the strand, or drag a crossing to move it. The Jones polynomial never
        changes; crossing number and writhe do. Tangle A is the{" "}
        <DemoLink href="https://en.wikipedia.org/wiki/Hard_unknot">
          Culprit
        </DemoLink>
        , an unknot that can't be simplified until you first make it worse.
        Tangle B is a trefoil in disguise.
      </DemoNotes>
      <KnotDemo />
      <MoveLegend />
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
