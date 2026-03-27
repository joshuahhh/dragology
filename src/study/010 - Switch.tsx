import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = { status: "on" | "off" };

const initialState: State = { status: "off" };

const draggable: Draggable<State> = ({ state, d }) => (
  <g transform={translate(50, 50)}>
    {/* Track */}
    <rect
      width={120}
      height={60}
      rx={30}
      fill={state.status === "on" ? "#22c55e" : "#d1d5db"}
    />

    {/* Draggable knob */}
    <circle
      transform={state.status === "on" ? translate(90, 30) : translate(30, 30)}
      r={26}
      fill="white"
      stroke="#e5e7eb"
      strokeWidth={1}
      filter="url(#shadow)"
      dragologyOnDrag={() => d.between([{ status: "off" }, { status: "on" }])}
    />

    {/* Drop-shadow filter */}
    <defs>
      <filter id="shadow" x="-100%" y="-100%" width="300%" height="300%">
        <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
      </filter>
    </defs>
  </g>
);

// Link up the Draggable to the page that displays it
export default demo(() => (
  <DemoDraggable
    draggable={draggable}
    initialState={initialState}
    width={200}
    height={200}
  />
));
