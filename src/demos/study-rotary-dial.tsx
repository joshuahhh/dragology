import _ from "lodash";
import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { rotateDeg, translate } from "../svgx/helpers";

type State = { angle: number };

const initialState: State = { angle: 0 };

const R = 60;
const TICKS = 12;

const draggable: Draggable<State> = ({ state, d }) => (
  <g transform={translate(200, 120)}>
    {/* Dial */}
    <g transform={rotateDeg(state.angle - 90)}>
      <circle
        r={R}
        fill="#f9fafb"
        stroke="#d1d5db"
        strokeWidth={2}
        filter="url(#shadow)"
        dragologyOnDrag={() => d.vary(state, param("angle"))}
      />
      <line
        x1={0}
        y1={0}
        x2={R - 14}
        y2={0}
        stroke="#374151"
        strokeWidth={3}
        strokeLinecap="round"
      />
    </g>

    {/* Tick marks */}
    {_.range(TICKS).map((i) => (
      <line
        transform={rotateDeg((i * 360) / TICKS)}
        x1={R + 6}
        y1={0}
        x2={R + 16}
        y2={0}
        stroke="#9ca3af"
        strokeWidth={2}
        strokeLinecap="round"
      />
    ))}

    {/* Angle readout */}
    <text
      transform={translate(0, R + 40)}
      textAnchor="middle"
      fontSize={13}
      fontFamily="system-ui, sans-serif"
      fill="#374151"
      fontWeight={500}
    >
      {Math.round(state.angle)}°
    </text>

    {/* Drop-shadow filter */}
    <defs>
      <filter id="shadow" x="-100%" y="-100%" width="300%" height="300%">
        <feDropShadow dx="0" dy="0" stdDeviation="4" floodOpacity="0.15" />
      </filter>
    </defs>
  </g>
);

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={400}
      height={250}
    />
  ),
  { tags: ["d.vary"] },
);
