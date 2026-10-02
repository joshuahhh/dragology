import { expect, it } from "vitest";
import { DragInitContext, dragSpecToBehavior } from "../DragBehavior";
import { DragSpecBuilder } from "../DragSpec";
import { Draggable } from "../draggable";
import { Vec2 } from "../math/vec2";
import { draggableLine } from "./helpers";
import { localToGlobal } from "./transform";

it("draggableLine places a unit line from a to b", () => {
  const a = Vec2(10, 20);
  const b = Vec2(-30, 50);
  const { transform, x1, y1, x2, y2 } = draggableLine(a, b);
  const at = (t: number) => localToGlobal(transform, Vec2(t, 0));
  expect(Vec2(x1, y1).eq(Vec2(0, 0)) && Vec2(x2, y2).eq(Vec2(1, 0))).toBe(true);
  for (const [t, expected] of [
    [0, a],
    [0.25, a.lerp(b, 0.25)],
    [1, b],
  ] as const) {
    expect(at(t).x).toBeCloseTo(expected.x);
    expect(at(t).y).toBeCloseTo(expected.y);
  }
});

it("a point grabbed on a draggableLine line follows it as its ends move", () => {
  type S = { a: [number, number]; b: [number, number] };
  const draggable: Draggable<S> = ({ state }) => (
    <g>
      <line id="seg" {...draggableLine(state.a, state.b)} stroke="black" />
    </g>
  );
  const start: S = { a: [0, 0], b: [100, 0] };
  const target: S = { a: [0, 100], b: [0, 0] };
  const ctx: DragInitContext<S> = {
    draggable,
    draggedPath: "seg/",
    draggedId: "seg",
    // grabbed 25% of the way along
    anchorPos: Vec2(0.25, 0),
    startState: start,
    debug: { varyVisualizer: false, trace: false },
  };
  const d = new DragSpecBuilder<S>(start);
  const result = dragSpecToBehavior(
    d.between([start, target]),
    ctx,
  )({ pointer: Vec2(0, 75) });
  expect(result.dropState).toEqual(target);
  expect(result.gap).toBeCloseTo(0);
});
