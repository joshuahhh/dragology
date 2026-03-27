import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = {
  value: boolean;
};

const SQUARE_SIZE = 40;
const TRACK_LENGTH = 60;

const initialState: State = { value: false };

const draggable: Draggable<State> = ({ state, d }) => (
  <g>
    <line
      x1={SQUARE_SIZE / 2}
      y1={SQUARE_SIZE / 2}
      x2={TRACK_LENGTH + SQUARE_SIZE / 2}
      y2={SQUARE_SIZE / 2}
      stroke="#cbd5e1"
      strokeWidth={6}
      strokeLinecap="round"
    />
    <rect
      id="switch"
      transform={translate(state.value ? TRACK_LENGTH : 0, 0)}
      width={SQUARE_SIZE}
      height={SQUARE_SIZE}
      rx={4}
      dragologyOnDrag={() =>
        d
          .between([{ value: true }, { value: false }])
          .withSnapRadius(10)
          .withDropTransition("elastic-out")
      }
    />
  </g>
);

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={150}
      height={80}
    />
  ),
  { tags: ["d.between", "spec.withSnapRadius", "spec.withDropTransition"] },
);
