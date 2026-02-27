import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { lessThan } from "../DragSpec";
import { translate } from "../svgx/helpers";

type State = { value: number };

const initialState: State = { value: 100 };

const W = 240;
const H = 6;
const R = 12;

const draggable: Draggable<State> = ({ state, d }) => (
  <g transform={translate(30, 60)}>
    {/* Track */}
    <rect width={W} height={H} rx={H / 2} fill="#e5e7eb" y={-H / 2} />

    {/* Filled portion */}
    <rect width={state.value} height={H} rx={H / 2} fill="#3b82f6" y={-H / 2} />

    {/* Thumb */}
    <circle
      transform={translate(state.value, 0)}
      r={R}
      fill="white"
      stroke="#d1d5db"
      strokeWidth={1.5}
      style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.15))" }}
      dragology={() =>
        d.vary(state, [["value"]], {
          constraint: (s) => [lessThan(0, s.value), lessThan(s.value, W)],
        })
      }
    />

    {/* Value readout */}
    <text
      transform={translate(state.value, 28)}
      textAnchor="middle"
      fontSize={13}
      fontFamily="system-ui, sans-serif"
      fill="#374151"
      fontWeight={500}
    >
      {Math.round(state.value)}
    </text>
  </g>
);

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={320}
      height={130}
    />
  ),
  { tags: ["d.vary [w/constraint]", "control"] },
);
