import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { scale, translate } from "../svgx/helpers";

type State = {
  scaleX: number;
  scaleY: number;
};

const initialState: State = { scaleX: 1, scaleY: 1 };

const draggable: Draggable<State> = ({ state, d }) => (
  <g>
    <circle
      transform={translate(100, 100) + scale(state.scaleX, state.scaleY)}
      cx={0}
      cy={0}
      r={50}
      fill="lightblue"
      dragologyOnDrag={() => d.vary(state, [param("scaleX"), param("scaleY")])}
    />
    <ellipse
      cx={100}
      cy={100}
      rx={50 * Math.abs(state.scaleX)}
      ry={50 * Math.abs(state.scaleY)}
      fill="none"
      stroke="black"
      strokeWidth={4}
    />
  </g>
);

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
