import { describe, expect, it } from "vitest";
import { DragInitContext, dragSpecToBehavior } from "./DragBehavior";
import { DragSpec, DragSpecBuilder } from "./DragSpec";
import { Draggable } from "./draggable";
import { Vec2 } from "./math/vec2";
import { translate } from "./svgx/helpers";
import { findByPathInLayered } from "./svgx/layers";
import { localToGlobal } from "./svgx/transform";

type S = { x: number; y: number };

const draggable: Draggable<S> = ({ state }) => (
  <g>
    <circle id="dot" transform={translate(state.x, state.y)} r={5} />
  </g>
);

const start: S = { x: 0, y: 0 };
const anchorPos = Vec2(2, 3);

const ctx: DragInitContext<S> = {
  draggable,
  draggedPath: "dot/",
  draggedId: "dot",
  anchorPos,
  startState: start,
  debug: { varyVisualizer: false, trace: false },
};

const d = new DragSpecBuilder<S>(start);

/** The grab point's position in a result's rendered preview. */
function renderedGrabPos(spec: DragSpec<S>, pointer: Vec2) {
  const result = dragSpecToBehavior(spec, ctx)({ pointer });
  const found = findByPathInLayered("dot/", result.preview())!;
  return {
    grabPos: result.grabPos,
    rendered: localToGlobal(found.accumulatedTransform, anchorPos),
  };
}

const triangle = [start, { x: 100, y: 0 }, { x: 0, y: 100 }];

describe("grabPos", () => {
  it.each([
    ["fixed", d.fixed({ x: 30, y: 40 })],
    ["between", d.between(triangle)],
    ["between (sharpness)", d.between(triangle, { sharpness: 3 })],
    [
      "between (natural-neighbor)",
      d.between(triangle, { interpolation: "natural-neighbor" }),
    ],
    ["closest", d.closest(triangle)],
    ["withSnapRadius (unsnapped)", d.between(triangle).withSnapRadius(5)],
    ["withSnapRadius (snapped)", d.between(triangle).withSnapRadius(50)],
  ])("matches the rendered preview for %s", (_name, spec) => {
    const { grabPos, rendered } = renderedGrabPos(spec, Vec2(30, 25));
    expect(grabPos).toBeDefined();
    expect(grabPos!.dist(rendered)).toBeCloseTo(0);
  });

  it("is dropped by a wrapper that replaces the preview", () => {
    const result = dragSpecToBehavior(
      d.fixed({ x: 30, y: 40 }).changeResult((r) => ({ preview: r.preview })),
      ctx,
    )({ pointer: Vec2(0) });
    expect(result.grabPos).toBeUndefined();
  });
});
