import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = { name: "r" | "g" | "b" };

const initialState: State = { name: "r" };

const POS = {
  r: { x: 50, y: 20 },
  g: { x: 16, y: 78 },
  b: { x: 84, y: 78 },
};

const COLOR = {
  r: "#ef4444",
  g: "#22c55e",
  b: "#3b82f6",
};

const draggable: Draggable<State> = ({ state, d }) => (
  <g transform={translate(60, 30)}>
    {/* Target dots */}
    {(["r", "g", "b"] as const).map((name) => (
      <circle
        transform={translate(POS[name].x, POS[name].y)}
        r={16}
        fill={COLOR[name]}
        opacity={0.25}
      />
    ))}

    {/* Draggable knob */}
    <circle
      transform={translate(POS[state.name].x, POS[state.name].y)}
      r={16}
      fill={COLOR[state.name]}
      stroke="white"
      strokeWidth={3}
      filter="url(#shadow)"
      dragology={() => d.between({ name: "r" }, { name: "g" }, { name: "b" })}
    />

    {/* Drop-shadow filter */}
    <defs>
      <filter id="shadow" x="-100%" y="-100%" width="300%" height="300%">
        <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.2" />
      </filter>
    </defs>
  </g>
);

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={200}
      height={200}
    />
  ),
  { tags: ["d.between"] },
);
