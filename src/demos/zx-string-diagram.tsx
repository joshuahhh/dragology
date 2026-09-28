import { produce } from "immer";
import _ from "lodash";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { and, DragSpec, DragSpecBuilder, inOrder, param } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { altKey } from "../modifierKeys";
import { path, translate } from "../svgx/helpers";

// # ZX string diagrams as direct manipulation
//
// A ZX diagram is a graph: spiders (Z = green, X = red, each with a
// phase) joined by wires, plus boundary wires at the top (inputs)
// and bottom (outputs). We draw it as a *string diagram*: every
// generator sits on its own horizontal level, and wires are strings
// running vertically between levels. Dragging a generator is a proof
// step:
//
// - drag vertically past another generator: interchange law
//   (`d.vary` on y, with `during` re-laying-out the other levels);
// - drag a spider onto an adjacent same-colored spider: spider
//   fusion, phases add (`d.dropTarget` per fusable spider, in a
//   `closest` with the free-move `vary`);
// - alt-drag out of a spider: unfusion – a fresh phase-0 spider of
//   the same color is pulled out, and legs follow it
//   (`switchToStateAndFollow`);
// - drag a cup up past its cap (or a cap down past its cup): the
//   snake equation yanks the zigzag straight (`whenFar` from a
//   constrained `vary` into the straightened state).

// ## State

type Color = "Z" | "X";

/** phase is in units of π/4, mod 8 */
type Spider = {
  type: "spider";
  color: Color;
  phase: number;
  x: number;
  y: number;
};
/** A cup (∪) turns two downward strings around; a cap (∩) two upward ones. */
type Bend = { type: "bend"; dir: "cup" | "cap"; x: number; y: number };
type Boundary = { type: "boundary"; side: "in" | "out"; x: number };
type Node = Spider | Bend | Boundary;

/** slot picks the left (0) or right (1) foot of a bend */
type Port = { node: string; slot?: 0 | 1 };
type Wire = { a: Port; b: Port };

type State = {
  nodes: Record<string, Node>;
  wires: Record<string, Wire>;
};

// ## Layout constants

const W = 360;
const TOP = 34;
const ROW_H = 56;
const X_MIN = 30;
const X_MAX = W - 30;
const BEND_W = 14;
const SPIDER_R = 11;

const COLORS = {
  Z: { fill: "#d9f6d3", stroke: "#3f8f3a" },
  X: { fill: "#f6c8c8", stroke: "#b03a3a" },
};

// ## Layout
//
// Internal nodes (spiders and bends) each get their own level. At
// rest, levels are TOP + ROW_H, TOP + 2*ROW_H, ... in order of y.
// While one node floats (during a drag), the others are laid out
// as if it weren't there, and then everything at or below the
// floater's level is pushed down one level to make room.

function internalIds(state: State): string[] {
  return Object.keys(state.nodes).filter(
    (id) => state.nodes[id].type !== "boundary",
  );
}

function relayout(state: State, floatingId?: string): State {
  const others = _.sortBy(
    internalIds(state).filter((id) => id !== floatingId),
    (id) => (state.nodes[id] as Spider | Bend).y,
    (id) => id,
  );
  const floater =
    floatingId && state.nodes[floatingId]
      ? (state.nodes[floatingId] as Spider | Bend)
      : undefined;
  return produce(state, (s) => {
    let slot = 0;
    for (const id of others) {
      const collapsedY = TOP + (slot + 1) * ROW_H;
      const node = s.nodes[id] as Spider | Bend;
      // Is the floater above this collapsed level? Then this node
      // is pushed down a level.
      const pushed =
        floater !== undefined && floater.y < collapsedY + ROW_H / 2;
      node.y = pushed ? collapsedY + ROW_H : collapsedY;
      slot++;
    }
  });
}

function outputY(state: State): number {
  return TOP + (internalIds(state).length + 1) * ROW_H;
}

/** Position of a port, plus its string's tangent: -1 up, +1 down, 0 free. */
function portInfo(
  state: State,
  port: Port,
): { pos: Vec2; tangent: -1 | 0 | 1 } {
  const node = state.nodes[port.node];
  switch (node.type) {
    case "spider":
      return { pos: Vec2(node.x, node.y), tangent: 0 };
    case "boundary":
      return {
        pos: Vec2(node.x, node.side === "in" ? TOP : outputY(state)),
        tangent: 0,
      };
    case "bend": {
      const dx = port.slot === 1 ? BEND_W : -BEND_W;
      if (node.dir === "cup") {
        return { pos: Vec2(node.x + dx, node.y - BEND_W / 2), tangent: -1 };
      } else {
        return { pos: Vec2(node.x + dx, node.y + BEND_W / 2), tangent: 1 };
      }
    }
  }
}

function wirePath(state: State, wire: Wire): string {
  const a = portInfo(state, wire.a);
  const b = portInfo(state, wire.b);
  const dy = b.pos.y - a.pos.y;
  const stiff = Math.max(Math.abs(dy) / 2, 24);
  const cp1 = a.pos.add(Vec2(0, a.tangent === 0 ? dy / 2 : a.tangent * stiff));
  const cp2 = b.pos.add(Vec2(0, b.tangent === 0 ? -dy / 2 : b.tangent * stiff));
  return path("M", a.pos, "C", cp1, cp2, b.pos);
}

// ## Graph helpers

function otherEnd(wire: Wire, nodeId: string): Port {
  return wire.a.node === nodeId ? wire.b : wire.a;
}

function wiresAt(state: State, nodeId: string): [string, Wire][] {
  return Object.entries(state.wires).filter(
    ([, w]) => w.a.node === nodeId || w.b.node === nodeId,
  );
}

/** Same-colored spiders connected to `id` by a wire: fusion candidates. */
function fusableWith(state: State, id: string): string[] {
  const me = state.nodes[id];
  if (me.type !== "spider") return [];
  const ids = new Set<string>();
  for (const [, w] of wiresAt(state, id)) {
    const other = otherEnd(w, id).node;
    const node = state.nodes[other];
    if (other !== id && node.type === "spider" && node.color === me.color) {
      ids.add(other);
    }
  }
  return [...ids];
}

/** Spider fusion: merge `from` into `into`, adding phases. */
function fuse(state: State, from: string, into: string): State {
  return relayout(
    produce(state, (s) => {
      const f = s.nodes[from] as Spider;
      const t = s.nodes[into] as Spider;
      t.phase = (t.phase + f.phase) % 8;
      for (const [wid, w] of Object.entries(s.wires)) {
        if (w.a.node === from) w.a = { node: into };
        if (w.b.node === from) w.b = { node: into };
        // a plain self-loop on a spider is the identity: drop it
        if (w.a.node === into && w.b.node === into) delete s.wires[wid];
      }
      delete s.nodes[from];
    }),
  );
}

/**
 * Unfusion, live: `child` was pulled out of `parent` and is joined
 * to it by one wire. Every other leg of the parent goes to whichever
 * of the two is on its side.
 */
function splitLegs(state: State, parent: string, child: string): State {
  const p = Vec2(state.nodes[parent] as Spider);
  const c = Vec2(state.nodes[child] as Spider);
  const axis = c.sub(p);
  if (axis.len() < 1) return state;
  return produce(state, (s) => {
    for (const [, w] of Object.entries(s.wires)) {
      const ends = [w.a, w.b];
      for (const end of ends) {
        if (end.node !== parent && end.node !== child) continue;
        const other = otherEnd(w, end.node);
        if (other.node === parent || other.node === child) continue;
        const otherPos = portInfo(state, other).pos;
        end.node = otherPos.sub(p).dot(axis) > 0 ? child : parent;
        end.slot = undefined;
      }
    }
  });
}

/** Does the wire from this bend lead to an opposite bend, forming a zigzag? */
function zigzagPartner(state: State, id: string): string | undefined {
  const me = state.nodes[id] as Bend;
  for (const [, w] of wiresAt(state, id)) {
    const other = otherEnd(w, id).node;
    const node = state.nodes[other];
    if (node.type !== "bend" || node.dir === me.dir) continue;
    if (me.dir === "cup" ? node.y < me.y : node.y > me.y) return other;
  }
  return undefined;
}

/** Snake equation: remove a cup/cap pair and join their loose ends. */
function yank(state: State, bendA: string, bendB: string): State {
  const between = wiresAt(state, bendA).find(
    ([, w]) => otherEnd(w, bendA).node === bendB,
  );
  const looseA = wiresAt(state, bendA).find(([wid]) => wid !== between?.[0]);
  const looseB = wiresAt(state, bendB).find(([wid]) => wid !== between?.[0]);
  if (!between || !looseA || !looseB) return state;
  return relayout(
    produce(state, (s) => {
      const endA = otherEnd(looseA[1], bendA);
      const endB = otherEnd(looseB[1], bendB);
      delete s.wires[between[0]];
      delete s.wires[looseB[0]];
      s.wires[looseA[0]] = { a: endA, b: endB };
      delete s.nodes[bendA];
      delete s.nodes[bendB];
    }),
  );
}

function phaseLabel(phase: number): string {
  const p = ((phase % 8) + 8) % 8;
  return ["", "π/4", "π/2", "3π/4", "π", "-3π/4", "-π/2", "-π/4"][p];
}

// ## Drag specs

function spiderSpec(
  d: DragSpecBuilder<State>,
  state: State,
  id: string,
  opts: { unfusedFrom?: string } = {},
): DragSpec<State> {
  const fusions = fusableWith(state, id).map((target) =>
    d.dropTarget(`spider-${target}-target`, fuse(state, id, target)),
  );
  const move = d
    .vary(state, [param("nodes", id, "x"), param("nodes", id, "y")], {
      constraint: (s) => inOrder([X_MIN, (s.nodes[id] as Spider).x, X_MAX]),
    })
    .during((s) => {
      s = relayout(s, id);
      if (opts.unfusedFrom) s = splitLegs(s, opts.unfusedFrom, id);
      return s;
    });
  return d
    .closest([...fusions, move])
    .withBranchTransition(150)
    .onDrop((s) => {
      if (!s.nodes[id]) return s; // fused away
      if (opts.unfusedFrom && wiresAt(s, id).length <= 1) {
        // pulled out but given no legs: fuse back in (a no-op proof step)
        return fuse(s, id, opts.unfusedFrom);
      }
      return relayout(s);
    });
}

function unfuseSpec(
  d: DragSpecBuilder<State>,
  state: State,
  id: string,
): DragSpec<State> {
  const parent = state.nodes[id] as Spider;
  const childId = `spider-${_.uniqueId()}-${Date.now().toString(36)}`;
  const wireId = `w-${_.uniqueId()}-${Date.now().toString(36)}`;
  const unfused = produce(state, (s) => {
    s.nodes[childId] = {
      type: "spider",
      color: parent.color,
      phase: 0,
      x: parent.x,
      y: parent.y,
    };
    s.wires[wireId] = { a: { node: id }, b: { node: childId } };
  });
  return d.switchToStateAndFollow(
    unfused,
    `spider-${childId}`,
    spiderSpec(d, unfused, childId, { unfusedFrom: id }),
  );
}

function bendSpec(
  d: DragSpecBuilder<State>,
  state: State,
  id: string,
): DragSpec<State> {
  const me = state.nodes[id] as Bend;
  const partnerId = zigzagPartner(state, id);
  const partner = partnerId ? (state.nodes[partnerId] as Bend) : undefined;
  const move = d
    .vary(state, [param("nodes", id, "x"), param("nodes", id, "y")], {
      constraint: (s) => {
        const b = s.nodes[id] as Bend;
        return and(
          ...inOrder([X_MIN + BEND_W, b.x, X_MAX - BEND_W]),
          // a zigzag can't be pushed through itself: the cup stays
          // below the cap (and vice versa) until it gets yanked
          ...(partner
            ? me.dir === "cup"
              ? inOrder([partner.y + ROW_H / 2 + 2, b.y])
              : inOrder([b.y, partner.y - ROW_H / 2 - 2])
            : []),
        );
      },
    })
    .during((s) => relayout(s, id));
  const spec = partnerId
    ? move.whenFar(yank(state, id, partnerId), { gapIn: 20, gapOut: 36 })
    : move;
  return spec.withBranchTransition(200).onDrop((s) => relayout(s));
}

// ## Rendering

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  const draggedSpider = draggedId?.startsWith("spider-")
    ? draggedId.slice("spider-".length)
    : null;
  const fusables =
    draggedSpider && state.nodes[draggedSpider]
      ? new Set(fusableWith(state, draggedSpider))
      : new Set<string>();
  const outY = outputY(state);

  return (
    <g>
      <style>{`
        .zx-grab { cursor: grab; }
        .zx-grab:active { cursor: grabbing; }
      `}</style>
      {/* boundary rails */}
      <line x1={0} y1={TOP} x2={W} y2={TOP} stroke="#e5e7eb" strokeWidth={1} />
      <line
        id="zx-out-rail"
        transform={translate(0, outY)}
        x1={0}
        y1={0}
        x2={W}
        y2={0}
        stroke="#e5e7eb"
        strokeWidth={1}
      />

      {/* wires */}
      {Object.entries(state.wires).map(([wid, wire]) => (
        <path
          id={`wire-${wid}`}
          d={wirePath(state, wire)}
          fill="none"
          stroke="#374151"
          strokeWidth={2}
          dragologyZIndex={-1}
        />
      ))}

      {/* nodes */}
      {Object.entries(state.nodes).map(([id, node]) => {
        if (node.type === "boundary") {
          return (
            <circle
              id={`bdry-${id}`}
              transform={translate(node.x, node.side === "in" ? TOP : outY)}
              r={2.5}
              fill="#374151"
            />
          );
        }
        if (node.type === "bend") {
          const half = BEND_W / 2;
          const arc =
            node.dir === "cup"
              ? path("M", [-BEND_W, -half], "A", BEND_W, BEND_W, 0, 0, 0, [
                  BEND_W,
                  -half,
                ])
              : path("M", [-BEND_W, half], "A", BEND_W, BEND_W, 0, 0, 1, [
                  BEND_W,
                  half,
                ]);
          const isDragged = draggedId === `bend-${id}`;
          return (
            <g
              id={`bend-${id}`}
              className="zx-grab"
              transform={translate(node.x, node.y)}
              dragologyZIndex={isDragged ? "/1" : false}
              dragologyOnDrag={() => bendSpec(d, state, id)}
            >
              <path d={arc} fill="none" stroke="transparent" strokeWidth={22} />
              <path
                d={arc}
                fill="none"
                stroke="#374151"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </g>
          );
        }
        // spider
        const label = phaseLabel(node.phase);
        const boxW = label
          ? Math.max(2 * SPIDER_R, 12 + label.length * 7)
          : 2 * SPIDER_R;
        const colors = COLORS[node.color];
        const isDragged = draggedId === `spider-${id}`;
        return (
          <g
            id={`spider-${id}`}
            className="zx-grab"
            transform={translate(node.x, node.y)}
            dragologyZIndex={isDragged ? "/1" : false}
            dragologyOnDrag={() =>
              d.reactTo(altKey, (alt) =>
                alt ? unfuseSpec(d, state, id) : spiderSpec(d, state, id),
              )
            }
          >
            <circle
              id={`spider-${id}-target`}
              r={26}
              fill="transparent"
              dragologyZIndex={-1}
            />
            {fusables.has(id) && (
              <circle
                id={`spider-${id}-halo`}
                r={22}
                fill={colors.fill}
                fillOpacity={0.35}
                stroke={colors.stroke}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dragologyZIndex={-1}
              />
            )}
            <rect
              transform={translate(-boxW / 2, -SPIDER_R)}
              width={boxW}
              height={2 * SPIDER_R}
              rx={SPIDER_R}
              fill={colors.fill}
              stroke={colors.stroke}
              strokeWidth={2}
            />
            {label && (
              <text
                id={`spider-${id}-label`}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontFamily="ui-serif, Georgia, serif"
                fontStyle="italic"
                fill="#111827"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
};

// ## Initial diagram
//
// Three input strings. String 1 carries Z(π/2) then Z(π/4) (fusable).
// String 2 carries X(π/4), parallel to them (interchangeable). String
// 3 has a zigzag: down into a cup, back up to a cap, down to the
// output (yankable).

const IN_X = [70, 160, 250];
const OUT_X = [70, 160, 310];

const initialState: State = relayout({
  nodes: {
    in1: { type: "boundary", side: "in", x: IN_X[0] },
    in2: { type: "boundary", side: "in", x: IN_X[1] },
    in3: { type: "boundary", side: "in", x: IN_X[2] },
    out1: { type: "boundary", side: "out", x: OUT_X[0] },
    out2: { type: "boundary", side: "out", x: OUT_X[1] },
    out3: { type: "boundary", side: "out", x: OUT_X[2] },
    za: { type: "spider", color: "Z", phase: 2, x: 70, y: 1 },
    xb: { type: "spider", color: "X", phase: 1, x: 160, y: 2 },
    zc: { type: "spider", color: "Z", phase: 1, x: 70, y: 3 },
    cap: { type: "bend", dir: "cap", x: 296, y: 4 },
    cup: { type: "bend", dir: "cup", x: 264, y: 5 },
  },
  wires: {
    w1: { a: { node: "in1" }, b: { node: "za" } },
    w2: { a: { node: "za" }, b: { node: "zc" } },
    w3: { a: { node: "zc" }, b: { node: "out1" } },
    w4: { a: { node: "in2" }, b: { node: "xb" } },
    w5: { a: { node: "xb" }, b: { node: "out2" } },
    w6: { a: { node: "in3" }, b: { node: "cup", slot: 0 } },
    w7: { a: { node: "cup", slot: 1 }, b: { node: "cap", slot: 0 } },
    w8: { a: { node: "cap", slot: 1 }, b: { node: "out3" } },
  },
});

export default demo(
  () => (
    <>
      <DemoNotes>
        A ZX-calculus string diagram where every drag is a rewrite.{" "}
        <b>Drag a spider vertically</b> past another to slide levels
        (interchange law).{" "}
        <b>Drop a spider on an adjacent same-colored spider</b> to fuse them
        (phases add). <b>Alt/Option-drag</b> out of a spider to unfuse a phase-0
        spider from it; legs follow the side you pull toward.{" "}
        <b>Drag the cup up past its cap</b> (or the cap down) to yank the zigzag
        straight (snake equation).
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={W}
        height={TOP + 8 * ROW_H}
      />
    </>
  ),
  {
    tags: [
      "d.closest",
      "d.dropTarget",
      "d.vary",
      "d.reactTo",
      "d.switchToStateAndFollow",
      "spec.during",
      "spec.whenFar",
      "spec.onDrop",
      "keyboard",
    ],
  },
);
