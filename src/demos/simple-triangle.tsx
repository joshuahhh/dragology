import _ from "lodash";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";

import { demo } from "../demo";
import { translate } from "../svgx/helpers";
import { assertNever } from "../utils/assert";

type State = {
  posIndex: number;
};

const POSITIONS = [
  [10, 10],
  [100, 10],
  [55, 90],
] as const;
const CENTER = [
  (POSITIONS[0][0] + POSITIONS[1][0] + POSITIONS[2][0]) / 3,
  (POSITIONS[0][1] + POSITIONS[1][1] + POSITIONS[2][1]) / 3,
];
const SQUARE_SIZE = 40;

const initialState: State = { posIndex: 0 };

const MODES = [
  "d.closest(states)",
  "d.closest(states).withFloating()",
  "d.between(states)",
  "d.between(states).withFloating()",
] as const;
type Mode = (typeof MODES)[number];

function draggableFactory(mode: Mode): Draggable<State> {
  return ({ state, d }) => (
    <g>
      {/* background positions */}
      {POSITIONS.map((pos, i) => (
        <rect
          key={i}
          transform={translate(pos)}
          width={SQUARE_SIZE}
          height={SQUARE_SIZE}
          rx={4}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth={1}
        />
      ))}
      {/* draggable square */}
      <rect
        id="switch"
        transform={translate(POSITIONS[state.posIndex])}
        width={SQUARE_SIZE}
        height={SQUARE_SIZE}
        rx={4}
        dragologyOnDrag={() => {
          const states: State[] = _.range(POSITIONS.length).map((i) => ({
            posIndex: i,
          }));

          switch (mode) {
            case "d.closest(states)":
              return d.closest(states);
            case "d.closest(states).withFloating()":
              return d.closest(states).withFloating();
            case "d.between(states)":
              return d.between(states);
            case "d.between(states).withFloating()":
              return d.between(states).withFloating();
            default:
              assertNever(mode);
          }
        }}
      />
      {/* extra line to see how background interpolates */}
      <line
        x1={CENTER[0] + SQUARE_SIZE / 2}
        y1={CENTER[1] + SQUARE_SIZE / 2}
        x2={POSITIONS[state.posIndex][0] + SQUARE_SIZE / 2}
        y2={POSITIONS[state.posIndex][1] + SQUARE_SIZE / 2}
        stroke="#cbd5e1"
        strokeWidth={6}
        strokeLinecap="round"
      />
    </g>
  );
}

const draggables = MODES.map((mode) => draggableFactory(mode));

export default demo(
  () => (
    <div>
      <DemoNotes>
        <p>
          An interface with three states, using different drag specs built on
          these states.
        </p>
      </DemoNotes>
      {draggables.map((draggable, i) => (
        <div key={i}>
          <h3 className="text-md font-medium font-mono mt-6 mb-1">
            {MODES[i]}
          </h3>
          <DemoDraggable
            draggable={draggable}
            initialState={initialState}
            width={200}
            height={150}
          />
        </div>
      ))}
    </div>
  ),
  {
    tags: ["d.between", "d.closest", "spec.withFloating"],
  },
);
