import { produce } from "immer";
import _ from "lodash";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";

import { demo } from "../demo";
import { translate } from "../svgx/helpers";

type State = {
  n: number;
  seq: [number, number][];
};

const initialState: State = {
  n: 4,
  seq: [],
};

const draggable: Draggable<State> = ({ state, d, setState }) => {
  const TILE_SIZE = 50;

  let perm = _.range(state.n);

  return (
    <g>
      <style>{`.braid-flip-target:hover { opacity: 0.15 !important; }`}</style>
      <g>
        {_.range(state.n).map((i) => (
          <line
            x1={i * TILE_SIZE}
            y1={0}
            x2={i * TILE_SIZE}
            y2={TILE_SIZE}
            stroke="black"
            strokeWidth={2}
          />
        ))}
      </g>
      {state.seq.map(([i, j], idx) => {
        perm = perm.slice();
        [perm[i], perm[j]] = [perm[j], perm[i]];
        return (
          <g id={`swap-${idx}`} transform={translate(0, (idx + 1) * TILE_SIZE)}>
            {/* swap lines */}
            <line
              id={`line-${perm[i]}-${idx}`}
              x1={j * TILE_SIZE}
              y1={0}
              x2={i * TILE_SIZE}
              y2={TILE_SIZE}
              stroke="black"
              strokeWidth={2}
              dragologyZIndex={-1}
            />
            <circle
              id={`line-bkgrnd-${perm[i]}-${idx}`}
              cx={((i + j) * TILE_SIZE) / 2}
              cy={TILE_SIZE / 2}
              r={TILE_SIZE / 7}
              fill="white"
              dragologyZIndex={0}
            />
            <line
              id={`line-${perm[j]}-${idx}`}
              x1={i * TILE_SIZE}
              y1={0}
              x2={j * TILE_SIZE}
              y2={TILE_SIZE}
              stroke="black"
              strokeWidth={2}
              dragologyZIndex={1}
            />
            <circle
              id={`flip-${idx}`}
              cx={((i + j) * TILE_SIZE) / 2}
              cy={TILE_SIZE / 2}
              r={TILE_SIZE / 3}
              fill="dodgerblue"
              dragologyZIndex={2}
              onClick={() =>
                setState(
                  produce(state, (s) => {
                    s.seq[idx] = [j, i];
                  }),
                )
              }
              cursor="pointer"
              opacity={0}
              className="braid-flip-target"
            />
            {/* the rest */}
            {_.range(state.n).map((k) =>
              k !== i && k !== j ? (
                <line
                  id={`line-${perm[k]}-${idx}`}
                  x1={k * TILE_SIZE}
                  y1={0}
                  x2={k * TILE_SIZE}
                  y2={TILE_SIZE}
                  stroke="black"
                  strokeWidth={2}
                />
              ) : null,
            )}
          </g>
        );
      })}
      <g transform={translate(0, (state.seq.length + 1) * TILE_SIZE)}>
        {perm.map((p, i) => (
          <line
            id={`line-${p}-${state.seq.length}`}
            x1={i * TILE_SIZE}
            y1={0}
            x2={i * TILE_SIZE}
            y2={0}
            stroke="black"
            strokeWidth={2}
          />
        ))}
      </g>
      {perm.map((p, i) => (
        <g
          id={`strand-end-${p}`}
          transform={translate(
            i * TILE_SIZE,
            (state.seq.length + 1) * TILE_SIZE,
          )}
          dragologyZIndex={1}
          dragologyOnDrag={() => {
            return d
              .closest([
                // drag to add crossing
                d.between([
                  state,
                  i > 0 &&
                    produce(state, (s) => {
                      s.seq.push([i, i - 1]);
                    }),
                  i < state.n - 1 &&
                    produce(state, (s) => {
                      s.seq.push([i, i + 1]);
                    }),
                ]),
                // drag to erase last crossing
                state.seq.length > 0 &&
                  d.between([
                    state,
                    produce(state, (s) => {
                      s.seq.pop();
                    }),
                  ]),
              ])
              .withSnapRadius(1, { chain: true });
          }}
        >
          <circle r={20} fill="transparent" />
          <circle r={4} fill="gray" />
        </g>
      ))}
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={250}
      height={400}
    />
  ),
  { tags: ["math", "d.closest", "d.between", "spec.withSnapRadius [chain]"] },
);
