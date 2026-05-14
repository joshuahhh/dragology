import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { equal, param } from "../DragSpec";
import { Draggable } from "../lib";
import { Vec2 } from "../math/vec2";
import { path, rotateDeg, translate } from "../svgx/helpers";

const W = 500;
const H = 360;
const TOOTH_MOD = 12;
const MESH_TOL = 2.5;

function gearRadius(teeth: number) {
  return (teeth * TOOTH_MOD) / (2 * Math.PI);
}

type GearData = {
  id: string;
  x: number;
  y: number;
  angle: number;
  teeth: number;
  color: string;
  hub: string;
};
type State = {
  gears: Record<string, GearData>;
};

function buildInitial(): State {
  const teethList = [22, 14, 28, 18, 12];
  const palette = ["#e74c3c", "#f39c12", "#27ae60", "#3498db", "#9b59b6"];
  const hubs = ["#c0392b", "#d35400", "#1e8449", "#21618c", "#6c3483"];
  const gears: Record<string, GearData> = {};
  let prev = Vec2(140, H / 2);
  let prevR = gearRadius(teethList[0]);
  for (let i = 0; i < teethList.length; i++) {
    const id = `gear-${i}`;
    const r = gearRadius(teethList[i]);
    const pos =
      i === 0
        ? prev
        : prev.add(Vec2.polarRad(prevR + r, i % 2 === 0 ? -0.4 : 0.4));
    gears[id] = {
      id,
      x: pos.x,
      y: pos.y,
      angle: 0,
      teeth: teethList[i],
      color: palette[i],
      hub: hubs[i],
    };
    prev = pos;
    prevR = r;
  }
  return propagateAnglesAbsolute({ gears }, "gear-0");
}

function propagateAnglesAbsolute(state: State, fromId: string): State {
  const ns = structuredClone(state);
  if (!ns.gears[fromId]) return ns;
  const visited = new Set<string>([fromId]);
  const queue: string[] = [fromId];
  while (queue.length) {
    const pid = queue.shift()!;
    const p = ns.gears[pid];
    const pR = gearRadius(p.teeth);
    for (const cid of Object.keys(ns.gears)) {
      if (visited.has(cid)) continue;
      const c = ns.gears[cid];
      const cR = gearRadius(c.teeth);
      if (Math.abs(Vec2(p).dist(c) - (pR + cR)) < MESH_TOL) {
        const alpha = Vec2(p).angleToDeg(c);
        ns.gears[cid].angle =
          alpha + 180 - 180 / c.teeth - (p.angle - alpha) * (p.teeth / c.teeth);
        visited.add(cid);
        queue.push(cid);
      }
    }
  }
  return ns;
}

function propagateAngleDelta(
  initial: State,
  current: State,
  fromId: string,
): State {
  const ns = structuredClone(current);
  const delta = ns.gears[fromId].angle - initial.gears[fromId].angle;
  if (delta === 0) return ns;
  const visited = new Set<string>([fromId]);
  const queue: { id: string; ratio: number }[] = [{ id: fromId, ratio: 1 }];
  while (queue.length) {
    const { id, ratio } = queue.shift()!;
    const p = ns.gears[id];
    const pR = gearRadius(p.teeth);
    for (const cid of Object.keys(ns.gears)) {
      if (visited.has(cid)) continue;
      const c = ns.gears[cid];
      if (Math.abs(Vec2(p).dist(c) - (pR + gearRadius(c.teeth))) < MESH_TOL) {
        const childRatio = -ratio * (p.teeth / c.teeth);
        ns.gears[cid].angle = initial.gears[cid].angle + delta * childRatio;
        visited.add(cid);
        queue.push({ id: cid, ratio: childRatio });
      }
    }
  }
  return ns;
}

function dockConstraint(state: State, idA: string, idB: string) {
  const a = state.gears[idA];
  const b = state.gears[idB];
  const dockDist = gearRadius(a.teeth) + gearRadius(b.teeth);
  const alpha = Vec2(a).angleToDeg(b);
  return [
    equal(Vec2(a).dist(b), dockDist),
    equal(
      (a.angle - alpha) * a.teeth + (b.angle - (alpha + 180)) * b.teeth,
      -180,
    ),
  ];
}

function gearShape(gear: GearData) {
  const r = gearRadius(gear.teeth);
  const rOuter = r + 4;
  const rInner = r - 4;
  const teeth = gear.teeth;
  const TIP = 0.35;
  const GAP = 0.35;
  const FLANK = (1 - TIP - GAP) / 2;
  const toothAngle = (t: number, offset: number) =>
    ((t + offset) / teeth) * 2 * Math.PI;
  const outline = path(
    ...Array.from({ length: teeth }, (_, t) => [
      t === 0 ? "M" : "L",
      Vec2.polarRad(rInner, toothAngle(t, -TIP / 2 - FLANK)),
      "L",
      Vec2.polarRad(rOuter, toothAngle(t, -TIP / 2)),
      "L",
      Vec2.polarRad(rOuter, toothAngle(t, TIP / 2)),
      "L",
      Vec2.polarRad(rInner, toothAngle(t, TIP / 2 + FLANK)),
    ]).flat(),
    "Z",
  );
  return (
    <g>
      <path d={outline} fill={gear.color} stroke="#222" strokeWidth={1.2} />
      <circle r={r * 0.45} fill={gear.hub} stroke="#222" strokeWidth={1} />
      <rect
        x={-2}
        y={-r * 0.45}
        width={4}
        height={r * 0.45 + r - 4}
        fill="#222"
        opacity={0.7}
      />
    </g>
  );
}

const draggable: Draggable<State> = ({ state, d, draggedId, isTracking }) => {
  const ids = Object.keys(state.gears);
  return (
    <g>
      {ids.map((id) => {
        const g = state.gears[id];
        const hubR = Math.max(10, gearRadius(g.teeth) * 0.32);
        return (
          <g
            id={id}
            transform={translate(g) + rotateDeg(g.angle)}
            dragologyOnDrag={() =>
              d
                .vary(state, param("gears", id, "angle"))
                .during((s) => propagateAngleDelta(state, s, id))
            }
          >
            {!isTracking && gearShape(g)}
            <g
              id={`hub-${id}`}
              dragologyZIndex={draggedId === `hub-${id}` ? "/2" : "/1"}
              dragologyOnDrag={() => {
                const otherIds = ids.filter((oid) => oid !== id);
                const dockBranches = otherIds.map((oid) =>
                  d.vary(
                    state,
                    [
                      param("gears", id, "x"),
                      param("gears", id, "y"),
                      param("gears", id, "angle"),
                    ],
                    { constraint: (s) => dockConstraint(s, id, oid) },
                  ),
                );
                return d
                  .closest(dockBranches)
                  .whenFar(
                    d.vary(state, [
                      param("gears", id, "x"),
                      param("gears", id, "y"),
                    ]),
                    { gap: 10 },
                  )
                  .withFloating()
                  .withInitContext({ anchorPos: Vec2(0) });
              }}
            >
              <circle r={hubR} fill="transparent" />
            </g>
          </g>
        );
      })}
    </g>
  );
};

export default demo(
  () => (
    <>
      <DemoNotes>
        Drag edge to spin, center to move. Gear connection logic is WIP.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={buildInitial()}
        width={W}
        height={H}
      />
    </>
  ),
  {
    tags: [
      "d.vary",
      "d.closest",
      "spec.during",
      "spec.whenFar",
      "spec.withFloating",
      "isTracking",
    ],
  },
);
