import { describe, expect, it } from "vitest";
import { DragInitContext, dragSpecToBehavior } from "./DragBehavior";
import { DragSpecBuilder } from "./DragSpec";
import { Draggable } from "./draggable";
import { Vec2 } from "./math/vec2";
import { translate } from "./svgx/helpers";

type S = { x: number; y: number };

const draggable: Draggable<S> = ({ state }) => (
  <g>
    <circle id="dot" transform={translate(state.x, state.y)} r={5} />
  </g>
);

const start: S = { x: 0, y: 0 };

const ctx: DragInitContext<S> = {
  draggable,
  draggedPath: "dot/",
  draggedId: "dot",
  anchorPos: Vec2(0),
  startState: start,
  debug: { varyVisualizer: false, trace: false },
};

const d = new DragSpecBuilder<S>(start);

// Two spokes out of the start state: right and down.
const spokes = [
  d.between([start, { x: 100, y: 0 }]),
  d.between([start, { x: 0, y: 100 }]),
];

const branchAt = (
  behavior: ReturnType<typeof dragSpecToBehavior<S>>,
  x: number,
  y: number,
) => behavior({ pointer: Vec2(x, y) }).activePath.split("/")[1];

describe("closest lockPast", () => {
  it("without it, a drag jumps between spokes", () => {
    const behavior = dragSpecToBehavior(d.closest(spokes), ctx);
    expect(branchAt(behavior, 60, 5)).toBe("0");
    expect(branchAt(behavior, 40, 60)).toBe("1");
  });

  it("with it, a drag stays on its spoke until the dot returns home", () => {
    const behavior = dragSpecToBehavior(
      d.closest(spokes, { lockPast: 10 }),
      ctx,
    );
    expect(branchAt(behavior, 60, 5)).toBe("0");
    // closer to the other spoke, but still out on this one
    expect(branchAt(behavior, 40, 60)).toBe("0");
    // projects back onto the start of this spoke, so unlocks
    expect(branchAt(behavior, -10, 60)).toBe("1");
  });

  it("is free to switch while within lockPast of home", () => {
    const behavior = dragSpecToBehavior(
      d.closest(spokes, { lockPast: 10 }),
      ctx,
    );
    expect(branchAt(behavior, 6, 1)).toBe("0");
    expect(branchAt(behavior, 1, 6)).toBe("1");
  });
});
