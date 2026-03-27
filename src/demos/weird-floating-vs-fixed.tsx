import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";

import { demo } from "../demo";
import { translate } from "../svgx/helpers";

type State = {
  value: number;
};

const initialState: State = { value: 0 };

const draggable: Draggable<State> = ({ state, d }) => (
  <rect
    id="switch"
    transform={translate(state.value * 100, 0)}
    x={0}
    y={0}
    width={100}
    height={100}
    dragologyOnDrag={() =>
      d.closest([
        d.fixed({ value: 0 }),
        d.fixed({ value: 1 }).withFloating({ ghost: { opacity: 0.5 } }),
        d.fixed({ value: 2 }),
        d.fixed({ value: 3 }).withFloating({ ghost: { opacity: 0.5 } }),
      ])
    }
  />
);

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={500}
      height={150}
    />
  ),
  { tags: ["spec.withFloating [ghost]", "d.fixed", "d.closest"] },
);
