import { produce } from "immer";
import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable, SetState } from "../draggable";

type State = {
  text: string;
};

const initialState: State = {
  text: "Hello, world!",
};

function TextInput({
  text,
  setState,
}: {
  text: string;
  setState: SetState<State>;
}) {
  return (
    <input
      type="text"
      value={text}
      onChange={(e) => {
        setState(
          produce((s: State) => {
            s.text = e.target.value;
          }),
          { transition: false },
        );
      }}
      placeholder="Type something..."
      className="border-2 border-gray-200 rounded-lg px-4 py-2 w-full text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-colors"
    />
  );
}

const draggable: Draggable<State> = ({ state, setState }) => (
  <g>
    <foreignObject
      x={20}
      y={20}
      width={300}
      height={40}
      style={{ overflow: "visible" }}
    >
      <TextInput text={state.text} setState={setState} />
    </foreignObject>
    <text x={20} y={100} fontSize={20} fill="#333">
      {state.text}
    </text>
  </g>
);

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={400}
      height={150}
    />
  ),
  { tags: ["setState", "component elements"] },
);
