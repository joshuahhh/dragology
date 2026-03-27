import { produce } from "immer";
import _ from "lodash";
import { amb, produceAmb } from "../amb";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";

import { demo } from "../demo";
import { translate } from "../svgx/helpers";

type State = {
  perm: string[];
};

const initialState: State = {
  perm: ["A", "B", "C", "D", "E"],
};

const draggable: Draggable<State> = ({ state, d }) => {
  const TILE_SIZE = 50;

  return (
    <g>
      {state.perm.map((p, idx) => {
        return (
          <g
            id={p}
            transform={translate(idx * TILE_SIZE, 0)}
            dragologyOnDrag={() => {
              const stateWithout = produce(state, (draft) => {
                draft.perm.splice(idx, 1);
              });
              const statesWith = produceAmb(stateWithout, (draft) => {
                const idx = amb(_.range(stateWithout.perm.length + 1));
                draft.perm.splice(idx, 0, p);
              });
              return d.closest(statesWith).whenFar(state).withFloating();
            }}
          >
            <rect
              x={0}
              y={0}
              width={TILE_SIZE}
              height={TILE_SIZE}
              stroke="black"
              strokeWidth={2}
              fill="white"
            />
            <text
              x={TILE_SIZE / 2}
              y={TILE_SIZE / 2}
              dominantBaseline="middle"
              textAnchor="middle"
              fontSize={20}
              fill="black"
            >
              {p}
            </text>
          </g>
        );
      })}
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={350}
      height={100}
    />
  ),
  {
    tags: ["d.closest", "spec.withFloating", "spec.whenFar", "reordering"],
  },
);
