import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { lessThan, param } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";

type State = {
  x: number;
  y: number;
};

const initialState: State = {
  x: 150,
  y: 150,
};

const center = Vec2(150, 150);
const radius = 100;

const draggable: Draggable<State> = ({ state, d }) => {
  return (
    <g>
      {/* boundary circle */}
      <circle
        {...center.cxy()}
        r={radius}
        fill="none"
        stroke="#ccc"
        strokeWidth={2}
        strokeDasharray="6 4"
      />
      {/* draggable point */}
      <circle
        id="point"
        transform={translate(Vec2(state.x, state.y))}
        r={14}
        fill="black"
        dragologyOnDrag={() =>
          d.vary(state, [param("x"), param("y")], {
            constraint: (s) => lessThan(center.dist2(s), radius ** 2),
          })
        }
      />
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={300}
      height={300}
    />
  ),
  { tags: ["d.vary [constraint]"] },
);
