import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = { status: "on" | "off" };

const initialState: State = { status: "off" };

const draggable: Draggable<State> = ({ state, d }) => (
  <g transform={translate(70, 70)}>
    <rect
      width={120}
      height={60}
      rx={30}
      fill={state.status === "on" ? "#22c55e" : "#d1d5db"}
    />
    <circle
      id="knob"
      transform={translate(state.status === "on" ? 90 : 30, 30)}
      r={26}
      fill="white"
      stroke="#e5e7eb"
      strokeWidth={1}
      filter="url(#shadow)"
      dragologyOnDrag={() =>
        d.between([{ status: "off" }, { status: "on" }]).withFloating({
          tether: (dist) => Math.sqrt(dist) / 4,
        })
      }
    />

    {/* Drop-shadow filter */}
    <defs>
      <filter id="shadow" x="-100%" y="-100%" width="300%" height="300%">
        <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
      </filter>
    </defs>
  </g>
);

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={260}
      height={200}
    />
  ),
  { tags: ["d.between", "spec.withFloating [tether]"] },
);
