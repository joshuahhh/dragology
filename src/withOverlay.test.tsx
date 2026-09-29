import { expect, it } from "vitest";
import { DragInitContext, dragSpecToBehavior } from "./DragBehavior";
import { DragSpecBuilder } from "./DragSpec";
import { Draggable } from "./draggable";
import { Vec2 } from "./math/vec2";
import { translate } from "./svgx/helpers";

type S = { x: number };

const draggable: Draggable<S> = ({ state }) => (
  <g>
    <circle id="dot" transform={translate(state.x, 0)} r={5} />
  </g>
);

const ctx: DragInitContext<S> = {
  draggable,
  draggedPath: "dot/",
  draggedId: "dot",
  anchorPos: Vec2(0),
  startState: { x: 0 },
  debug: { varyVisualizer: false, trace: false },
};

const d = new DragSpecBuilder<S>({ x: 0 });

it("withOverlay draws on top of the preview, with its own ids", () => {
  // the overlay reuses the preview's id "dot"; that must not collide
  const spec = d.fixed({ x: 10 }).withOverlay(<circle id="dot" r={2} />);
  const result = dragSpecToBehavior(spec, ctx)({ pointer: Vec2(10, 0) });
  const preview = result.preview();
  const ids = [...preview.byId.keys()];
  expect(ids).toContain("dot");
  const overlayIds = ids.filter((id) => id.startsWith("overlay-"));
  expect(overlayIds.length).toBeGreaterThan(0);
  const top = (id: string) => preview.byId.get(id)!.stackingPath[0] ?? 0;
  for (const id of overlayIds) expect(top(id)).toBeGreaterThan(top("dot"));
  // the drop state is unaffected
  expect(result.dropState).toEqual({ x: 10 });
});
