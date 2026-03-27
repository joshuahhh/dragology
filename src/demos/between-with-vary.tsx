import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { inOrder, param } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";
import { objectEntries } from "../utils/js";

const islandPos = { top: Vec2(150, 20), bottom: Vec2(150, 180) };

type State =
  | {
      mode: "slider";
      value: number;
    }
  | {
      mode: "island";
      id: keyof typeof islandPos;
    };

const initialState: State = { mode: "slider", value: 50 };

const trackLeftPos = Vec2(50, 100);
const trackRightPos = Vec2(250, 100);

const draggable: Draggable<State> = ({ state, d }) => {
  const onSlider = state.mode === "slider";
  const knobPos = onSlider
    ? trackLeftPos.lerp(trackRightPos, state.value / 100)
    : islandPos[state.id];

  return (
    <g>
      {/* track */}
      <line
        {...trackLeftPos.xy1()}
        {...trackRightPos.xy2()}
        stroke={onSlider ? "#ccc" : "#eee"}
        strokeWidth={4}
        strokeLinecap="round"
      />
      {onSlider && (
        <text
          id="slider-label"
          {...knobPos.sub(Vec2(0, 22)).xy()}
          textAnchor="middle"
          fontSize={12}
          fill="#666"
        >
          {Math.round(state.value)}
        </text>
      )}
      {/* islands */}
      {objectEntries(islandPos).map(([key, pos]) => {
        const isActive = state.mode === "island" && state.id === key;
        return (
          <g transform={translate(pos)}>
            <rect
              x={-40}
              y={-20}
              width={80}
              height={40}
              rx={8}
              fill={isActive ? "#d0e8ff" : "#e8e8e8"}
              stroke={isActive ? "#88b" : "#bbb"}
            />
            <text x={0} y={5} textAnchor="middle" fontSize={13} fill="#999">
              {key}
            </text>
          </g>
        );
      })}
      {/* knob */}
      <circle
        id="knob"
        transform={translate(knobPos)}
        r={14}
        fill="#333"
        dragologyOnDrag={() =>
          d.between([
            d.vary({ mode: "slider", value: 50 }, param("value"), {
              constraint: (s) => inOrder(0, s.value, 100),
            }),
            objectEntries(islandPos).map(([key]) =>
              d.fixed({ mode: "island", id: key }),
            ),
          ])
        }
      />
    </g>
  );
};

export default demo(
  () => (
    <>
      <DemoNotes>
        This demonstrates using <code>d.between</code> with a drag spec (
        <code>d.vary</code>) inside it. It's pretty weird!
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={300}
        height={240}
      />
    </>
  ),
  { tags: ["d.between [dynamic]", "d.vary"] },
);
