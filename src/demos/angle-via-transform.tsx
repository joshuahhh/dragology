import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { rotateDeg, translate } from "../svgx/helpers";

type State = {
  angle: number;
};

const initialState: State = {
  angle: 0,
};

const draggable: Draggable<State> = ({ state, d }) => {
  const radius = 100;

  return (
    <g transform={translate(100, 100)}>
      <g transform={rotateDeg(state.angle)}>
        <line x1={0} y1={0} x2={radius} y2={0} stroke="black" strokeWidth={4} />
        <circle
          transform={translate(radius, 0)}
          cx={0}
          cy={0}
          r={20}
          fill="black"
          dragologyOnDrag={() => d.vary(state, param("angle"))}
        />
      </g>
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
