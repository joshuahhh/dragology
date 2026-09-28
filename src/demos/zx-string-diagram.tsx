import { produce } from "immer";
import _ from "lodash";
import { useState } from "react";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { dragSpecToBehavior } from "../DragBehavior";
import { Draggable } from "../draggable";
import { and, DragSpec, DragSpecBuilder, inOrder, param } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { altKey } from "../modifierKeys";
import { path, scale, translate } from "../svgx/helpers";

// # ZX string diagrams as direct manipulation
//
// A ZX diagram is a graph: spiders (Z = green, X = red, each with a
// phase) joined by wires, plus boundary wires at the top (inputs)
// and bottom (outputs). We draw it as a *string diagram*: every
// generator sits on its own horizontal level, and wires are strings
// running vertically between levels. Every drag is a rewrite rule:
//
// - drag a generator vertically past another: interchange law
//   (`d.vary` on y, with `during` re-laying-out the other levels);
// - drop a spider on an adjacent same-colored spider: spider fusion,
//   phases add (`d.dropTarget` per fusable spider, in a `closest`
//   with the free-move `vary`);
// - drop a bare spider (phase 0, two legs) on either neighbor:
//   identity removal (same mechanism);
// - alt-drag out of a spider: unfusion – a fresh phase-0 spider of
//   the same color is pulled out, and legs follow it
//   (`switchToStateAndFollow`);
// - drag a phase label onto an adjacent same-colored spider: the
//   phase moves across the wire (fusion followed by unfusion);
// - drag a wire's bead sideways: the wire bows (isotopy). Pull it
//   across a parallel twin between a Z and an X: both wires vanish
//   (Hopf rule) – `whenFar` from a constrained `vary`;
// - drag a cup up past its cap (or a cap down past its cup): the
//   snake equation yanks the zigzag straight, carrying along any
//   spiders threaded on it (same `whenFar` pattern).
//
// Each puzzle is a diagram plus a goal diagram; the badge lights up
// when the two are isomorphic as graphs.

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
type Wire = {
  a: Port;
  b: Port;
  /** horizontal bowing of the string, in px */
  bow?: number;
  /** where along the string its bead sits, 0..1 */
  beadT?: number;
};

type PuzzleId = "cnot2" | "snake" | "phase" | "playground";

type State = {
  puzzle: PuzzleId;
  nodes: Record<string, Node>;
  wires: Record<string, Wire>;
};

// ## Layout constants

const DIAG_W = 320;
const GOAL_W = 150;
const W = DIAG_W + GOAL_W;
const H = 500;
const TOP = 34;
const ROW_H = 56;
const X_MIN = 30;
const X_MAX = DIAG_W - 30;
const BEND_W = 14;
const SPIDER_R = 11;
const BOW_GAP = 28;

const COLORS = {
  Z: { fill: "#d9f6d3", stroke: "#3f8f3a" },
  X: { fill: "#f6c8c8", stroke: "#b03a3a" },
};
const INK = "#374151";

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
    others.forEach((id, slot) => {
      const collapsedY = TOP + (slot + 1) * ROW_H;
      const node = s.nodes[id] as Spider | Bend;
      // Is the floater above this collapsed level? Then this node
      // is pushed down a level.
      const pushed =
        floater !== undefined && floater.y < collapsedY + ROW_H / 2;
      node.y = pushed ? collapsedY + ROW_H : collapsedY;
    });
  });
}

function pairKey(w: Wire): string {
  return [w.a.node, w.b.node].sort().join("|");
}

/** Parallel wires that sit on top of each other get fanned out. */
function spreadParallel(state: State): State {
  const groups = _.groupBy(Object.keys(state.wires), (wid) =>
    pairKey(state.wires[wid]),
  );
  return produce(state, (s) => {
    for (const wids of Object.values(groups)) {
      if (wids.length < 2) continue;
      const sorted = _.sortBy(
        wids,
        (wid) => s.wires[wid].bow ?? 0,
        (wid) => wid,
      );
      const bows = sorted.map((wid) => s.wires[wid].bow ?? 0);
      const crowded = bows.some((b, i) => i > 0 && b - bows[i - 1] < 8);
      if (!crowded) continue;
      sorted.forEach((wid, i) => {
        s.wires[wid].bow = (i - (sorted.length - 1) / 2) * BOW_GAP;
      });
    }
  });
}

/** Clean up after a rewrite: levels and parallel wires. */
function tidy(state: State): State {
  return spreadParallel(relayout(state));
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

function wireGeom(state: State, wire: Wire): [Vec2, Vec2, Vec2, Vec2] {
  const a = portInfo(state, wire.a);
  const b = portInfo(state, wire.b);
  const dy = b.pos.y - a.pos.y;
  const stiff = Math.max(Math.abs(dy) / 2, 24);
  // bowing is perpendicular to the chord, so sliding the bead along
  // the string and pulling it sideways are independent
  const chord = b.pos.sub(a.pos);
  const perp = chord.len() < 1 ? Vec2(1, 0) : Vec2(-chord.y, chord.x).norm();
  const bow = perp.mul(wire.bow ?? 0);
  const cp1 = a.pos
    .add(Vec2(0, a.tangent === 0 ? dy / 2 : a.tangent * stiff))
    .add(bow);
  const cp2 = b.pos
    .add(Vec2(0, b.tangent === 0 ? -dy / 2 : b.tangent * stiff))
    .add(bow);
  return [a.pos, cp1, cp2, b.pos];
}

function bezierAt([p0, p1, p2, p3]: [Vec2, Vec2, Vec2, Vec2], t: number) {
  const u = 1 - t;
  return p0
    .mul(u * u * u)
    .add(p1.mul(3 * u * u * t))
    .add(p2.mul(3 * u * t * t))
    .add(p3.mul(t * t * t));
}

function wirePath(state: State, wire: Wire): string {
  const [p0, p1, p2, p3] = wireGeom(state, wire);
  return path("M", p0, "C", p1, p2, p3);
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

function neighbors(state: State, nodeId: string): string[] {
  return _.uniq(
    wiresAt(state, nodeId).map(([, w]) => otherEnd(w, nodeId).node),
  );
}

function isBare(state: State, id: string): boolean {
  const n = state.nodes[id];
  return (
    n.type === "spider" && n.phase % 8 === 0 && wiresAt(state, id).length === 2
  );
}

/** Same-colored spiders connected to `id` by a wire: fusion candidates. */
function fusableWith(state: State, id: string): string[] {
  const me = state.nodes[id];
  if (me.type !== "spider") return [];
  return neighbors(state, id).filter((other) => {
    const node = state.nodes[other];
    return other !== id && node.type === "spider" && node.color === me.color;
  });
}

/** Spider fusion: merge `from` into `into`, adding phases. */
function fuse(state: State, from: string, into: string): State {
  return tidy(
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

/** Identity removal: a bare spider's two legs become one wire. */
function removeIdentity(state: State, id: string): State {
  const [[keepId, keep], [dropId, drop]] = wiresAt(state, id);
  return tidy(
    produce(state, (s) => {
      const endA = otherEnd(keep, id);
      const endB = otherEnd(drop, id);
      delete s.wires[dropId];
      if (endA.node === endB.node && s.nodes[endA.node].type === "spider") {
        delete s.wires[keepId]; // would be a self-loop
      } else {
        s.wires[keepId] = { ...keep, a: endA, b: endB };
      }
      delete s.nodes[id];
    }),
  );
}

/** Move the phase from one spider to an adjacent same-colored one. */
function transferPhase(state: State, from: string, to: string): State {
  return produce(state, (s) => {
    const f = s.nodes[from] as Spider;
    const t = s.nodes[to] as Spider;
    t.phase = (t.phase + f.phase) % 8;
    f.phase = 0;
  });
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
      for (const end of [w.a, w.b]) {
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

/** Hopf rule: two parallel wires between a Z and an X cancel. */
function hopf(state: State, wid1: string, wid2: string): State {
  return tidy(
    produce(state, (s) => {
      delete s.wires[wid1];
      delete s.wires[wid2];
    }),
  );
}

/** A parallel wire between the same Z and X spiders, if any (nearest bow). */
function hopfTwin(state: State, wid: string): string | undefined {
  const w = state.wires[wid];
  const na = state.nodes[w.a.node];
  const nb = state.nodes[w.b.node];
  if (na.type !== "spider" || nb.type !== "spider" || na.color === nb.color) {
    return undefined;
  }
  const twins = Object.keys(state.wires).filter(
    (other) => other !== wid && pairKey(state.wires[other]) === pairKey(w),
  );
  return _.minBy(twins, (other) =>
    Math.abs((state.wires[other].bow ?? 0) - (w.bow ?? 0)),
  );
}

/**
 * Follow a string out of a bend through any threaded spiders (degree
 * 2). If it reaches an opposite bend in zigzag position, that's the
 * partner for a snake yank.
 */
function zigzagPartner(state: State, id: string): string | undefined {
  const me = state.nodes[id] as Bend;
  for (const [wid0, w0] of wiresAt(state, id)) {
    let prevWid = wid0;
    let cur = otherEnd(w0, id).node;
    for (let steps = 0; steps < 50; steps++) {
      const node = state.nodes[cur];
      if (node.type === "bend") {
        if (node.dir === me.dir) break;
        const ok = me.dir === "cup" ? node.y < me.y : node.y > me.y;
        if (ok) return cur;
        break;
      }
      if (node.type !== "spider") break;
      const legs = wiresAt(state, cur);
      if (legs.length !== 2) break;
      const [nextWid, next] = legs.find(([lw]) => lw !== prevWid)!;
      prevWid = nextWid;
      cur = otherEnd(next, cur).node;
    }
  }
  return undefined;
}

/** Erase a bend, splicing its two legs into one wire. */
function splice(s: State, bendId: string) {
  const legs = wiresAt(s, bendId);
  if (legs.length !== 2) return;
  const [[keepId, keep], [dropId, drop]] = legs;
  const endA = otherEnd(keep, bendId);
  const endB = otherEnd(drop, bendId);
  delete s.wires[dropId];
  s.wires[keepId] = { ...keep, a: endA, b: endB };
  delete s.nodes[bendId];
}

/** Snake equation: remove a cup/cap pair, keeping what was threaded on them. */
function yank(state: State, bendA: string, bendB: string): State {
  return tidy(
    produce(state, (s) => {
      splice(s, bendA);
      splice(s, bendB);
    }),
  );
}

function phaseLabel(phase: number): string {
  const p = ((phase % 8) + 8) % 8;
  return ["", "π/4", "π/2", "3π/4", "π", "-3π/4", "-π/2", "-π/4"][p];
}

// ## Graph isomorphism (good enough for tiny diagrams)
//
// Boundaries keep their names; internal nodes are refined by their
// neighborhoods a few times, then the whole thing is serialized.

function graphKey(state: State): string {
  let labels: Record<string, string> = {};
  for (const [id, n] of Object.entries(state.nodes)) {
    labels[id] =
      n.type === "boundary"
        ? `B:${id}`
        : n.type === "spider"
          ? `S:${n.color}:${((n.phase % 8) + 8) % 8}`
          : `D:${n.dir}`;
  }
  for (let round = 0; round < 4; round++) {
    const next: Record<string, string> = {};
    for (const id of Object.keys(state.nodes)) {
      const nbrs = wiresAt(state, id)
        .map(([, w]) => labels[otherEnd(w, id).node])
        .sort();
      next[id] = `${labels[id]}(${nbrs.join(",")})`;
    }
    labels = next;
  }
  const nodes = Object.values(labels).sort();
  const edges = Object.values(state.wires)
    .map((w) => [labels[w.a.node], labels[w.b.node]].sort().join("~"))
    .sort();
  return nodes.join(";") + "//" + edges.join(";");
}

// ## Drag specs

/** Every node the dragged spider could be dropped on, with the result. */
function spiderDropTargets(state: State, id: string): [string, State][] {
  const out: [string, State][] = [];
  for (const t of fusableWith(state, id)) out.push([t, fuse(state, id, t)]);
  if (isBare(state, id)) {
    for (const t of neighbors(state, id)) {
      if (t === id || out.some(([o]) => o === t)) continue;
      if (state.nodes[t].type === "bend") continue;
      out.push([t, removeIdentity(state, id)]);
    }
  }
  return out;
}

const HIT_R = 34;

/**
 * Like `d.dropTarget`, but hit-tests the dragged spider's center
 * against the target node wherever the user might aim: where the
 * target was when the drag began, and where it comes to rest once the
 * dragged spider is out of the way (levels reflow, so these can be a
 * level apart – and the target jumps between them as you cross it).
 */
function nearNodeSpec(
  d: DragSpecBuilder<State>,
  state: State,
  draggedNode: string,
  target: string,
  result: State,
): DragSpec<State> {
  const collapsed = relayout(
    produce(state, (s) => {
      delete s.nodes[draggedNode];
    }),
  );
  const spots = [
    portInfo(state, { node: target }).pos,
    portInfo(collapsed, { node: target }).pos,
  ];
  return d.custom((ctx) => {
    const inner = dragSpecToBehavior<State>(
      { type: "fixed", state: result },
      ctx,
    );
    return (frame) => {
      const center = frame.pointer.sub(ctx.anchorPos);
      const near = spots.some((spot) => center.dist(spot) < HIT_R);
      return {
        ...inner(frame),
        gap: near ? 0 : Infinity,
        activePath: "near-node",
      };
    };
  });
}

function spiderSpec(
  d: DragSpecBuilder<State>,
  state: State,
  id: string,
  opts: { unfusedFrom?: string } = {},
): DragSpec<State> {
  const drops = spiderDropTargets(state, id).map(([t, result]) =>
    nearNodeSpec(d, state, id, t, result),
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
    .closest([...drops, move])
    .withBranchTransition(150)
    .onDrop((s) => {
      if (!s.nodes[id]) return s; // fused away
      if (opts.unfusedFrom && wiresAt(s, id).length <= 1) {
        // pulled out but given no legs: fuse back in (a no-op proof step)
        return fuse(s, id, opts.unfusedFrom);
      }
      return tidy(s);
    });
}

function freshId(prefix: string): string {
  return `${prefix}-${_.uniqueId()}-${Date.now().toString(36)}`;
}

function unfuseSpec(
  d: DragSpecBuilder<State>,
  state: State,
  id: string,
): DragSpec<State> {
  const parent = state.nodes[id] as Spider;
  const childId = freshId("s");
  const wireId = freshId("w");
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

function labelSpec(
  d: DragSpecBuilder<State>,
  state: State,
  id: string,
): DragSpec<State> {
  const drops = fusableWith(state, id).map((t) =>
    d.dropTarget(`spider-${t}-target`, transferPhase(state, id, t)),
  );
  return d
    .closest(drops)
    .whenFar(state, { gap: 0 })
    .withFloating()
    .withBranchTransition(150);
}

function beadSpec(
  d: DragSpecBuilder<State>,
  state: State,
  wid: string,
): DragSpec<State> {
  const twinId = hopfTwin(state, wid);
  const myBow = state.wires[wid].bow ?? 0;
  const twinBow = twinId ? (state.wires[twinId].bow ?? 0) : 0;
  const onRight = myBow >= twinBow;
  const withBead = produce(state, (s) => {
    s.wires[wid].bow = myBow;
    s.wires[wid].beadT = s.wires[wid].beadT ?? 0.5;
  });
  const move = d.vary(
    withBead,
    [param("wires", wid, "bow"), param("wires", wid, "beadT")],
    {
      constraint: (s) => {
        const w = s.wires[wid];
        return and(
          ...inOrder([0.12, w.beadT!, 0.88]),
          ...inOrder([-70, w.bow!, 70]),
          // a wire can't be pulled through its twin – until the
          // pair cancels
          ...(twinId
            ? onRight
              ? inOrder([twinBow + 10, w.bow!])
              : inOrder([w.bow!, twinBow - 10])
            : []),
        );
      },
    },
  );
  const spec = twinId
    ? move.whenFar(hopf(state, wid, twinId), { gapIn: 16, gapOut: 30 })
    : move;
  return spec.withBranchTransition(200);
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
  return spec.withBranchTransition(200).onDrop((s) => tidy(s));
}

// ## Rendering

type RenderCtx = {
  d: DragSpecBuilder<State>;
  draggedId: string | null;
};

function renderDiagram(state: State, ctx: RenderCtx | null, prefix = "") {
  const P = (id: string) => prefix + id;
  const draggedId = ctx?.draggedId ?? null;

  // Which nodes light up as drop targets for the current drag?
  const targets = new Set<string>();
  if (draggedId) {
    const m = /^spider-(.+?)(-label)?$/.exec(draggedId);
    if (m && state.nodes[m[1]]) {
      if (m[2]) {
        for (const t of fusableWith(state, m[1])) targets.add(t);
      } else {
        for (const [t] of spiderDropTargets(state, m[1])) targets.add(t);
      }
    }
  }

  const outY = outputY(state);

  const halo = (id: string, colors: { fill: string; stroke: string }) =>
    targets.has(id) && (
      <circle
        id={P(`halo-${id}`)}
        r={22}
        fill={colors.fill}
        fillOpacity={0.35}
        stroke={colors.stroke}
        strokeWidth={1.5}
        strokeDasharray="4 3"
        dragologyZIndex={-1}
      />
    );

  return (
    <g>
      {/* boundary rails */}
      <line x1={0} y1={TOP} x2={DIAG_W} y2={TOP} stroke="#e5e7eb" />
      <line
        id={P("out-rail")}
        transform={translate(0, outY)}
        x1={0}
        y1={0}
        x2={DIAG_W}
        y2={0}
        stroke="#e5e7eb"
      />

      {/* wires */}
      {Object.entries(state.wires).map(([wid, wire]) => (
        <path
          id={P(`wire-${wid}`)}
          d={wirePath(state, wire)}
          fill="none"
          stroke={INK}
          strokeWidth={2}
          dragologyZIndex={-1}
        />
      ))}

      {/* beads: grab a wire here to bow it (and pull twins apart) */}
      {ctx &&
        Object.entries(state.wires).map(([wid, wire]) => {
          const pos = bezierAt(wireGeom(state, wire), wire.beadT ?? 0.5);
          const twin = hopfTwin(state, wid) !== undefined;
          const isDragged = draggedId === `bead-${wid}`;
          return (
            <g
              id={`bead-${wid}`}
              className="zx-bead"
              opacity={twin || isDragged ? 1 : 0}
              transform={translate(pos)}
              dragologyOnDrag={() => beadSpec(ctx.d, state, wid)}
            >
              <circle r={10} fill="transparent" />
              <circle r={4.5} fill="white" stroke={INK} strokeWidth={1.5} />
            </g>
          );
        })}

      {/* nodes */}
      {Object.entries(state.nodes).map(([id, node]) => {
        if (node.type === "boundary") {
          return (
            <g
              id={P(`bdry-${id}`)}
              transform={translate(node.x, node.side === "in" ? TOP : outY)}
            >
              {halo(id, { fill: "#e5e7eb", stroke: INK })}
              <circle r={2.5} fill={INK} />
            </g>
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
              id={P(`bend-${id}`)}
              transform={translate(node.x, node.y)}
              dragologyZIndex={isDragged ? "/1" : false}
              dragologyOnDrag={
                ctx ? () => bendSpec(ctx.d, state, id) : undefined
              }
            >
              <path d={arc} fill="none" stroke="transparent" strokeWidth={22} />
              <path
                d={arc}
                fill="none"
                stroke={INK}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </g>
          );
        }
        // spider
        const label = phaseLabel(node.phase);
        const colors = COLORS[node.color];
        const isDragged = draggedId === `spider-${id}`;
        const pillW = 8 + label.length * 6.5;
        return (
          <g
            id={P(`spider-${id}`)}
            transform={translate(node.x, node.y)}
            dragologyZIndex={isDragged ? "/1" : false}
            dragologyOnDrag={
              ctx
                ? () =>
                    ctx.d.reactTo(altKey, (alt) =>
                      alt
                        ? unfuseSpec(ctx.d, state, id)
                        : spiderSpec(ctx.d, state, id),
                    )
                : undefined
            }
          >
            <circle
              id={P(`spider-${id}-target`)}
              r={26}
              fill="transparent"
              dragologyZIndex={-1}
            />
            {halo(id, colors)}
            <circle
              r={SPIDER_R}
              fill={colors.fill}
              stroke={colors.stroke}
              strokeWidth={2}
            />
            {label && (
              <g
                id={P(`spider-${id}-label`)}
                className="zx-label"
                transform={translate(SPIDER_R + 4, -SPIDER_R - 4)}
                dragologyZIndex={1}
                dragologyOnDrag={
                  ctx ? () => labelSpec(ctx.d, state, id) : undefined
                }
              >
                <rect
                  width={pillW}
                  height={16}
                  rx={8}
                  fill="white"
                  stroke={colors.stroke}
                  strokeWidth={1}
                />
                <text
                  transform={translate(pillW / 2, 8)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={11}
                  fontFamily="ui-serif, Georgia, serif"
                  fontStyle="italic"
                  fill="#111827"
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  {label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  const puzzle = PUZZLES[state.puzzle];
  const proved = puzzle.goal
    ? graphKey(state) === GOAL_KEYS[state.puzzle]
    : false;
  const goalScale = 0.42;
  const goalH = puzzle.goal ? (outputY(puzzle.goal) + TOP) * goalScale : 0;

  return (
    <g>
      <style>{`
        .zx-bead:hover { opacity: 1; }
        .zx-label { cursor: grab; }
      `}</style>
      {renderDiagram(state, { d, draggedId })}
      {puzzle.goal && (
        <g transform={translate(DIAG_W + 8, 12)}>
          <rect
            id="goal-frame"
            dragologyZIndex={-2}
            width={GOAL_W - 16}
            height={goalH + 44}
            rx={8}
            fill={proved ? "#ecfdf5" : "#f9fafb"}
            stroke={proved ? "#10b981" : "#e5e7eb"}
            strokeWidth={proved ? 2 : 1}
          />
          <text
            transform={translate(10, 18)}
            fontSize={11}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fill="#6b7280"
            style={{ userSelect: "none" }}
          >
            GOAL
          </text>
          {proved && (
            <text
              id="goal-proved"
              transform={translate(GOAL_W - 26, 18)}
              textAnchor="end"
              fontSize={11}
              fontWeight="bold"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fill="#059669"
              style={{ userSelect: "none" }}
            >
              PROVED ∎
            </text>
          )}
          <g
            transform={
              translate((GOAL_W - 16 - DIAG_W * goalScale) / 2, 30) +
              scale(goalScale)
            }
          >
            {renderDiagram(puzzle.goal, null, "goal-")}
          </g>
        </g>
      )}
    </g>
  );
};

// ## Puzzles
//
// Each is a diagram to start from and (usually) a diagram to reach.
// Level numbers in `y` are just orderings; `relayout` spaces them.

type Puzzle = {
  title: string;
  blurb: string;
  start: State;
  goal: State | null;
};

const bd = (side: "in" | "out", x: number): Boundary => ({
  type: "boundary",
  side,
  x,
});
const sp = (color: Color, phase: number, x: number, y: number): Spider => ({
  type: "spider",
  color,
  phase,
  x,
  y,
});
const bend = (dir: "cup" | "cap", x: number, y: number): Bend => ({
  type: "bend",
  dir,
  x,
  y,
});
const w = (a: string, b: string, extra: Partial<Wire> = {}): Wire => ({
  a: { node: a },
  b: { node: b },
  ...extra,
});
const foot = (node: string, slot: 0 | 1): Port => ({ node, slot });

const L = 100; // left qubit
const R = 220; // right qubit

const cnot2Start: State = tidy({
  puzzle: "cnot2",
  nodes: {
    in1: bd("in", L),
    in2: bd("in", R),
    out1: bd("out", L),
    out2: bd("out", R),
    z1: sp("Z", 0, L, 1),
    x1: sp("X", 0, R, 2),
    z2: sp("Z", 0, L, 3),
    x2: sp("X", 0, R, 4),
  },
  wires: {
    a: w("in1", "z1"),
    b: w("z1", "z2"),
    c: w("z2", "out1"),
    d: w("in2", "x1"),
    e: w("x1", "x2"),
    f: w("x2", "out2"),
    g: w("z1", "x1"),
    h: w("z2", "x2"),
  },
});

const identity2: State = tidy({
  puzzle: "cnot2",
  nodes: {
    in1: bd("in", L),
    in2: bd("in", R),
    out1: bd("out", L),
    out2: bd("out", R),
  },
  wires: { a: w("in1", "out1"), b: w("in2", "out2") },
});

const snakeStart: State = tidy({
  puzzle: "snake",
  nodes: {
    in1: bd("in", 100),
    out1: bd("out", 240),
    cap: bend("cap", 200, 1),
    za: sp("Z", 1, 150, 2),
    cup: bend("cup", 130, 3),
    zb: sp("Z", 1, 240, 4),
  },
  wires: {
    a: { a: { node: "in1" }, b: foot("cup", 0) },
    b: { a: foot("cup", 1), b: { node: "za" } },
    c: { a: { node: "za" }, b: foot("cap", 0) },
    d: { a: foot("cap", 1), b: { node: "zb" } },
    e: w("zb", "out1"),
  },
});

const snakeGoal: State = tidy({
  puzzle: "snake",
  nodes: {
    in1: bd("in", 160),
    out1: bd("out", 160),
    z: sp("Z", 2, 160, 1),
  },
  wires: { a: w("in1", "z"), b: w("z", "out1") },
});

const phaseStart: State = tidy({
  puzzle: "phase",
  nodes: {
    in1: bd("in", L),
    in2: bd("in", R),
    out1: bd("out", L),
    out2: bd("out", R),
    p: sp("Z", 2, L, 1),
    z: sp("Z", 0, L, 2),
    x: sp("X", 0, R, 3),
  },
  wires: {
    a: w("in1", "p"),
    b: w("p", "z"),
    c: w("z", "out1"),
    d: w("in2", "x"),
    e: w("x", "out2"),
    f: w("z", "x"),
  },
});

const phaseGoal: State = tidy({
  puzzle: "phase",
  nodes: {
    in1: bd("in", L),
    in2: bd("in", R),
    out1: bd("out", L),
    out2: bd("out", R),
    z: sp("Z", 0, L, 1),
    x: sp("X", 0, R, 2),
    p: sp("Z", 2, L, 3),
  },
  wires: {
    a: w("in1", "z"),
    b: w("z", "p"),
    c: w("p", "out1"),
    d: w("in2", "x"),
    e: w("x", "out2"),
    f: w("z", "x"),
  },
});

const playgroundStart: State = tidy({
  puzzle: "playground",
  nodes: {
    in1: bd("in", 60),
    in2: bd("in", 150),
    in3: bd("in", 230),
    out1: bd("out", 60),
    out2: bd("out", 150),
    out3: bd("out", 290),
    za: sp("Z", 2, 60, 1),
    xb: sp("X", 1, 150, 2),
    zc: sp("Z", 1, 60, 3),
    cap: bend("cap", 276, 4),
    cup: bend("cup", 244, 5),
  },
  wires: {
    w1: w("in1", "za"),
    w2: w("za", "zc"),
    w3: w("zc", "out1"),
    w4: w("in2", "xb"),
    w5: w("xb", "out2"),
    w6: { a: { node: "in3" }, b: foot("cup", 0) },
    w7: { a: foot("cup", 1), b: foot("cap", 0) },
    w8: { a: foot("cap", 1), b: { node: "out3" } },
  },
});

const PUZZLES: Record<PuzzleId, Puzzle> = {
  cnot2: {
    title: "CNOT · CNOT = 1",
    blurb:
      "Two CNOTs in a row cancel. Fuse the Zs, fuse the Xs, pull one of the " +
      "twin wires across the other (Hopf), then drop each bare spider on a neighbor.",
    start: cnot2Start,
    goal: identity2,
  },
  phase: {
    title: "Phase through CNOT",
    blurb:
      "A Z-phase slides through a CNOT's control. Fuse it into the control, " +
      "Alt-drag a fresh spider out toward the bottom-left (legs follow the " +
      "side you pull toward, so only the output goes with it), then drag the " +
      "phase label down onto it.",
    start: phaseStart,
    goal: phaseGoal,
  },
  snake: {
    title: "Spider on a snake",
    blurb:
      "Two π/4 spiders sit on a zigzag wire. Drag the cup up past the cap to " +
      "yank it straight, then fuse.",
    start: snakeStart,
    goal: snakeGoal,
  },
  playground: {
    title: "Playground",
    blurb: "No goal – three independent strands to poke at.",
    start: playgroundStart,
    goal: null,
  },
};

const GOAL_KEYS = _.mapValues(PUZZLES, (p) => (p.goal ? graphKey(p.goal) : ""));

const PUZZLE_ORDER: PuzzleId[] = ["cnot2", "phase", "snake", "playground"];

export default demo(
  () => {
    const [puzzleId, setPuzzleId] = useState<PuzzleId>("cnot2");
    const [attempt, setAttempt] = useState(0);
    const puzzle = PUZZLES[puzzleId];
    return (
      <>
        <DemoNotes>
          A ZX-calculus string diagram editor where every drag is a rewrite
          rule. <b>Drag spiders</b> past each other (interchange), <b>drop</b>{" "}
          one on an adjacent same-colored spider (fusion; a bare phase-0 spider
          drops on any neighbor: identity), <b>Alt-drag</b> out of a spider
          (unfusion), <b>drag a phase label</b> onto a same-colored neighbor,{" "}
          <b>drag a wire's bead</b> sideways (and through a twin wire: Hopf),
          and <b>drag a cup past its cap</b> (snake).
        </DemoNotes>
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          {PUZZLE_ORDER.map((id) => (
            <button
              key={id}
              className={
                "px-2 py-1 text-sm rounded border " +
                (id === puzzleId
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50")
              }
              onClick={() => {
                setPuzzleId(id);
                setAttempt((n) => n + 1);
              }}
            >
              {PUZZLES[id].title}
            </button>
          ))}
          <button
            className="px-2 py-1 text-sm rounded border bg-white text-gray-500 border-gray-300 hover:bg-gray-50"
            onClick={() => setAttempt((n) => n + 1)}
          >
            reset
          </button>
        </div>
        <DemoNotes>{puzzle.blurb}</DemoNotes>
        <DemoDraggable
          key={`${puzzleId}-${attempt}`}
          draggable={draggable}
          initialState={puzzle.start}
          width={W}
          height={H}
        />
      </>
    );
  },
  {
    tags: [
      "d.closest",
      "d.dropTarget",
      "d.vary",
      "d.reactTo",
      "d.switchToStateAndFollow",
      "spec.during",
      "spec.whenFar",
      "spec.withFloating",
      "spec.onDrop",
      "keyboard",
    ],
  },
);
