import { produce } from "immer";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";

import { demo } from "../demo";
import { rotateDeg, translate } from "../svgx/helpers";

type State = {
  perm: string[];
};

const initialState: State = {
  perm: ["A", "B", "C", "D"],
};

const TILE_SIZE = 50;
const RADIUS = 100;

const draggable: Draggable<State> = ({ state, d }) => (
  <g transform={translate(130, 130)}>
    {/* background circle */}
    <circle
      cx={0}
      cy={0}
      r={RADIUS}
      fill="none"
      stroke="#eee"
      strokeWidth={8}
    />

    {/* item circles */}
    {state.perm.map((p) => {
      const angle = (state.perm.indexOf(p) / state.perm.length) * 360 + 180;
      return (
        <g
          id={p}
          transform={
            rotateDeg(angle) + translate(RADIUS, 0) + rotateDeg(-angle)
          }
          dragologyZIndex={1}
          dragologyOnDrag={() => {
            const newState1 = produce(state, (s) => {
              s.perm.push(s.perm.shift()!);
            });
            const newState2 = produce(state, (s) => {
              s.perm.unshift(s.perm.pop()!);
            });

            return d
              .closest([
                d.between([state, newState1]),
                d.between([state, newState2]),
              ])
              .withSnapRadius(10, { chain: true });
          }}
        >
          <circle
            cx={0}
            cy={0}
            r={TILE_SIZE / 2}
            fill="white"
            stroke="black"
            strokeWidth={2}
          />
          <text
            x={0}
            y={0}
            dominantBaseline="middle"
            textAnchor="middle"
            fontSize={14}
            fill="black"
          >
            {p}
          </text>
        </g>
      );
    })}
  </g>
);

export default demo(
  () => (
    <div>
      <DemoNotes>Tests interpolation of rotations.</DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={260}
        height={260}
      />
    </div>
  ),
  { tags: ["spec.withSnapRadius [chain]", "d.between", "reordering"] },
);
