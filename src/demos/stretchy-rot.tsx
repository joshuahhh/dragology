import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { rotateDeg, scale, translate } from "../svgx/helpers";

type State = {
  angle: number;
  scaleX: number;
};

const initialState: State = { angle: 0, scaleX: 1 };

const draggable: Draggable<State> = ({ state, d }) => (
  <circle
    transform={
      translate(100, 100) +
      rotateDeg(state.angle) +
      scale(state.scaleX, 1 / state.scaleX)
    }
    cx={0}
    cy={0}
    r={50}
    fill="lightblue"
    dragologyOnDrag={() => d.vary(state, [param("angle"), param("scaleX")])}
  />
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
