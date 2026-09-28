import { demo } from "../../demo";
import { DemoDraggable, DemoLink, DemoNotes } from "../../demo/ui";
import { Draggable } from "../../draggable";
import { param } from "../../DragSpec";
import { altKey } from "../../modifierKeys";
import { rotateDeg, translate } from "../../svgx/helpers";
import { SUB, subCurve, tangentAt, walk } from "./geometry";
import {
  Knot,
  analyze,
  arcAt,
  invariants,
  isConsistent,
  movesAt,
  resampleKnot,
} from "./knot";
import { figureEight, trefoil, unknot } from "./presets";

const WIDTH = 560;
const HEIGHT = 470;
const STROKE = 5;
const GAP = 4; // white gap on each side of an over-strand
const BRIDGE_HALF = 14; // half-length of the over-strand bridge at a crossing
const BRIDGE_PTS = 7;

const PALETTE = ["#e11d48", "#2563eb", "#16a34a"];
const MONO = "#334155";

const presets: { label: string; make: () => Knot }[] = [
  { label: "trefoil", make: trefoil },
  { label: "figure-eight", make: figureEight },
  { label: "unknot", make: unknot },
];

const initialState: Knot = trefoil();

const draggable: Draggable<Knot> = ({ state, d, draggedId, setState }) => {
  const an = analyze(state);
  const inv = invariants(an);
  const { samples, cum } = an;
  const M = samples.length;

  const colorOfArc = (arc: string) =>
    inv.tricolorable ? PALETTE[inv.arcColor.get(arc) ?? 0] : MONO;

  // Precompute arc membership per sample segment (walk visits once).
  const segColor: string[] = new Array(M);
  for (let m = 0; m < M; m++) {
    segColor[m] = colorOfArc(arcAt(an, m + 0.5));
  }

  const startTangent = tangentAt(samples, 0);
  const startAngle =
    (Math.atan2(startTangent.y, startTangent.x) * 180) / Math.PI;

  return (
    <g>
      <style>{`.knot-preset:hover rect { fill: #e2e8f0; }`}</style>

      {/* the curve, one polyline per control span so arcs can carry
          their own color (span count is constant within a move, so
          these interpolate point-for-point) */}
      <g style={{ pointerEvents: "none" }}>
        {an.pts.map((_, j) => {
          const pts = [];
          for (let k = 0; k <= SUB; k++) {
            const q = samples[(j * SUB + k) % M];
            pts.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`);
          }
          return (
            <polyline
              points={pts.join(" ")}
              fill="none"
              stroke={segColor[j * SUB + Math.floor(SUB / 2)]}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </g>

      {/* over-strand bridges at each crossing: a white halo cuts the
          under-strand, then the over-strand is redrawn on top */}
      {an.infos.map((info) => {
        const u0 = walk(cum, info.overU, -BRIDGE_HALF);
        const u1 = walk(cum, info.overU, BRIDGE_HALF);
        const bridge = subCurve(samples, cum, u0, u1, BRIDGE_PTS);
        const dPath =
          "M" +
          bridge.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join("L");
        return (
          <g id={`x-${info.id}`} style={{ pointerEvents: "none" }}>
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
              stroke={colorOfArc(arcAt(an, info.overU))}
              strokeWidth={STROKE}
              strokeLinecap="butt"
            />
          </g>
        );
      })}

      {/* orientation marker */}
      <path
        transform={translate(samples[0]) + rotateDeg(startAngle)}
        d="M-4,-5 L5,0 L-4,5 Z"
        fill="white"
        stroke={segColor[0]}
        strokeWidth={1.5}
        style={{ pointerEvents: "none" }}
      />

      {/* drag handles at every control point */}
      {an.pts.map((p, j) => {
        const kp = state.pts[j];
        const id = `pt-${kp.id}`;
        const isDragged = draggedId === id;
        return (
          <circle
            id={id}
            transform={translate(p)}
            r={isDragged ? 7 : 9}
            fill={isDragged ? "rgba(15, 23, 42, 0.25)" : "transparent"}
            style={{ cursor: "grab" }}
            dragologyOnDrag={() =>
              d.reactTo(altKey, (under) => {
                const moves = movesAt(state, kp.id, under);
                const start: Knot = {
                  ...state,
                  brush: { at: kp.id, dx: 0, dy: 0 },
                };
                let lastGood = start;
                const cosmetic = d
                  .vary(start, [param("brush", "dx"), param("brush", "dy")])
                  .during((s) => {
                    if (isConsistent(s)) {
                      lastGood = s;
                      return s;
                    }
                    return lastGood;
                  });
                return d
                  .closest(moves.map((m) => d.between([m.from, m.to])))
                  .withSnapRadius(4, { chain: true })
                  .whenFar(cosmetic, { gapIn: 12, gapOut: 24 });
              })
            }
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
      {presets.map((preset, k) => (
        <g
          id={`preset-${preset.label}`}
          className="knot-preset"
          transform={translate(WIDTH - 16 - (presets.length - k) * 96, 14)}
          style={{ cursor: "pointer" }}
          onClick={() => setState(preset.make())}
        >
          <rect width={88} height={24} rx={6} fill="#f1f5f9" stroke="#cbd5e1" />
          <text
            x={44}
            y={16}
            textAnchor="middle"
            fontSize={12}
            fill="#334155"
            fontFamily="ui-sans-serif, system-ui"
          >
            {preset.label}
          </text>
        </g>
      ))}
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
        . Grab anywhere on the strand: pull sideways to twist out a loop (R1),
        push it across a neighboring strand (R2; hold <kbd>Alt</kbd> to pass
        under), or slide it across a crossing (R3). Drag a loop back into the
        strand or a bigon back across its partner to undo. Drag in other
        directions to reshape the curve without changing the diagram. The Jones
        polynomial never changes; crossing number and writhe do.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={WIDTH}
        height={HEIGHT}
        transformDropState={resampleKnot}
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
      "spec.withSnapRadius [chain]",
      "spec.during",
      "math",
    ],
  },
);
