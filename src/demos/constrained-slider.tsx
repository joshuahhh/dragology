import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { inOrder, param } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";

type State = {
  value: number;
};

const initialState: State = {
  value: 50,
};

const trackLeft = 20;
const trackRight = 280;
const trackY = 50;

const draggable: Draggable<State> = ({ state, d }) => {
  const knobX = trackLeft + (state.value / 100) * (trackRight - trackLeft);

  return (
    <g>
      {/* track */}
      <line
        x1={trackLeft}
        y1={trackY}
        x2={trackRight}
        y2={trackY}
        stroke="#ccc"
        strokeWidth={4}
        strokeLinecap="round"
      />
      {/* valid range indicator */}
      <line
        x1={trackLeft + 0.2 * (trackRight - trackLeft)}
        y1={trackY}
        x2={trackLeft + 0.8 * (trackRight - trackLeft)}
        y2={trackY}
        stroke="#4a9"
        strokeWidth={4}
        strokeLinecap="round"
      />
      {/* labels */}
      <text
        x={trackLeft}
        y={trackY + 25}
        textAnchor="middle"
        fontSize={12}
        fill="#999"
      >
        0
      </text>
      <text
        x={trackRight}
        y={trackY + 25}
        textAnchor="middle"
        fontSize={12}
        fill="#999"
      >
        100
      </text>
      <text
        x={trackLeft + 0.2 * (trackRight - trackLeft)}
        y={trackY - 15}
        textAnchor="middle"
        fontSize={11}
        fill="#4a9"
      >
        20
      </text>
      <text
        x={trackLeft + 0.8 * (trackRight - trackLeft)}
        y={trackY - 15}
        textAnchor="middle"
        fontSize={11}
        fill="#4a9"
      >
        80
      </text>
      {/* knob */}
      <circle
        id="knob"
        transform={translate(Vec2(knobX, trackY))}
        r={12}
        fill="black"
        dragologyOnDrag={() =>
          d.vary(state, param("value"), {
            constraint: (s) => inOrder(20, s.value, 80),
          })
        }
      />
      {/* value display */}
      <text
        x={knobX}
        y={trackY + 40}
        textAnchor="middle"
        fontSize={13}
        fill="black"
      >
        {Math.round(state.value)}
      </text>
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={300}
      height={100}
    />
  ),
  { tags: ["d.vary [constraint]"] },
);
