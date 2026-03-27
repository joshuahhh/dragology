import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = { status: "on" | "off" };

const initialState: State = { status: "off" };

const sharpnessLevels = [1, 1.5, 2, 3, 5, 10];
const cols = 3;
const switchW = 120;
const switchH = 60;
const cellW = 180;
const cellH = 110;
const padX = 20;
const padY = 20;

const draggable: Draggable<State> = ({ state, d }) => (
  <g>
    <defs>
      <filter id="shadow" x="-100%" y="-100%" width="300%" height="300%">
        <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
      </filter>
    </defs>
    {sharpnessLevels.map((sharpness, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padX + col * cellW;
      const y = padY + row * cellH;
      return (
        <g key={i} transform={translate(x, y)}>
          <text y={-6} fontSize={11} fontFamily="monospace" fill="#999">
            sharpness: {sharpness}
          </text>
          <rect
            width={switchW}
            height={switchH}
            rx={30}
            fill={state.status === "on" ? "#22c55e" : "#d1d5db"}
          />
          <circle
            id={`knob-${i}`}
            transform={
              state.status === "on" ? translate(90, 30) : translate(30, 30)
            }
            r={26}
            fill="white"
            stroke="#e5e7eb"
            strokeWidth={1}
            filter="url(#shadow)"
            dragologyOnDrag={() =>
              d.between([{ status: "off" }, { status: "on" }], { sharpness })
            }
          />
        </g>
      );
    })}
  </g>
);

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={padX * 2 + cols * cellW - (cellW - switchW)}
      height={
        padY * 2 +
        Math.ceil(sharpnessLevels.length / cols) * cellH -
        (cellH - switchH)
      }
    />
  ),
  { tags: ["d.between [sharpness]"] },
);
