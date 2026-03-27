import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";

type State = {
  angle: number;
};

const initialState: State = {
  angle: 0,
};

const draggable: Draggable<State> = ({ state, d }) => {
  const center = Vec2(100, 100);
  const radius = 100;
  const knobPos = Vec2(radius, 0).rotateDeg(state.angle).add(center);

  return (
    <g>
      <circle
        transform={translate(knobPos)}
        r={20}
        fill="black"
        dragologyOnDrag={() => d.vary(state, param("angle"))}
      />
      <line
        {...center.xy1()}
        {...knobPos.xy2()}
        stroke="black"
        strokeWidth={4}
      />
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={250}
      height={250}
    />
  ),
  { tags: ["d.vary"] },
);
