import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { rotateDeg, translate } from "../svgx/helpers";

type State = {
  hours: number;
};

const initialState: State = {
  hours: 4.333333,
};

const draggable: Draggable<State> = ({ state, d }) => {
  function hand(
    name: string,
    degrees: number,
    length: number,
    strokeWidth: number,
  ) {
    return (
      <g id={name} transform={translate(100, 100) + rotateDeg(degrees)}>
        <line
          x1={0}
          y1={0}
          x2={length}
          y2={0}
          stroke="black"
          strokeWidth={strokeWidth}
        />
        <circle
          transform={translate(length, 0)}
          cx={0}
          cy={0}
          r={10}
          fill="black"
          dragologyOnDrag={() => d.vary(state, param("hours"))}
        />
      </g>
    );
  }

  return (
    <g>
      {hand("hour", (state.hours * 360) / 12 - 90, 60, 6)}
      {hand("minute", (state.hours * 360) / 1 - 90, 80, 4)}
      {hand("second", state.hours * 60 * 360 - 90, 90, 2)}
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
