import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";

type State = {
  colorIdx: number;
};

const initialState: State = { colorIdx: 0 };

const draggable: Draggable<State> = ({ state, setState }) => {
  const colors = ["red", "green", "blue", "yellow"];

  return (
    <rect
      x={40 * state.colorIdx}
      y={0}
      width={100}
      height={100}
      fill={colors[state.colorIdx]}
      onClick={() => {
        const nextIdx = (state.colorIdx + 1) % colors.length;
        setState({ colorIdx: nextIdx });
      }}
      style={{ cursor: "pointer" }}
    />
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={300}
      height={150}
    />
  ),
  { tags: ["setState"] },
);
