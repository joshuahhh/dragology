import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = {
  value: number;
};

const SIZE = 40;

const initialState: State = { value: 0 };

const draggable: Draggable<State> = ({ state, d }) => (
  <g>
    <polyline
      points={[0, 1, 2, 3]
        .map((v) => `${v * 100 + SIZE / 2},${20 * (-1) ** v + 20 + SIZE / 2}`)
        .join(" ")}
      fill="none"
      stroke="#cbd5e1"
      strokeWidth={6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect
      id="switch"
      transform={translate(state.value * 100, 20 * (-1) ** state.value + 20)}
      width={SIZE}
      height={SIZE}
      rx={4}
      dragologyOnDrag={() =>
        d
          .closest([
            state.value > 0 && d.between([state, { value: state.value - 1 }]),
            state.value < 3 && d.between([state, { value: state.value + 1 }]),
          ])
          .withSnapRadius(10, { chain: true })
      }
    />
  </g>
);

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={400}
      height={100}
    />
  ),
  { tags: ["spec.withSnapRadius [chain]", "d.between"] },
);
