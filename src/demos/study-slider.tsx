import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { inOrder, param } from "../DragSpec";
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
      filter="url(#shadow)"
      dragologyOnDrag={() =>
        d.vary(state, param("value"), {
          constraint: (s) => inOrder(0, s.value, W),
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

    {/* Drop-shadow filter */}
    <defs>
      <filter id="shadow" x="-100%" y="-100%" width="300%" height="300%">
        <feDropShadow dx="0" dy="1" stdDeviation="3" floodOpacity="0.15" />
      </filter>
    </defs>
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
  { tags: ["d.vary [constraint]"] },
);
