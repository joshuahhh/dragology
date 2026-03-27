import _ from "lodash";
import { amb, produceAmb, require } from "../amb";
import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";
import { uPairs } from "../utils";

type State = {
  w: number;
  h: number;
  points: Vec2[];
};

const initialState: State = {
  w: 6,
  h: 6,
  points: [Vec2(1, 1), Vec2(4, 2), Vec2(3, 5), Vec2(1, 4)],
};

const draggable: Draggable<State> = ({ state, d }) => {
  const TILE_SIZE = 50;

  return (
    <g transform={translate(20, 20)}>
      {/* Grid points */}
      {_.range(state.w).map((x) =>
        _.range(state.h).map((y) => (
          <circle cx={x * TILE_SIZE} cy={y * TILE_SIZE} r={5} fill="gray" />
        )),
      )}

      {/* Polygon edges */}
      {state.points.map((pt, idx) => {
        const nextPt = state.points[(idx + 1) % state.points.length];
        return (
          <line
            {...pt.mul(TILE_SIZE).xy1()}
            {...nextPt.mul(TILE_SIZE).xy2()}
            stroke="black"
            strokeWidth={2}
          />
        );
      })}

      {/* Draggable polygon vertices */}
      {state.points.map((pt, idx) => (
        <circle
          id={`vertex-${idx}`}
          transform={translate(pt.x * TILE_SIZE, pt.y * TILE_SIZE)}
          r={10}
          fill="black"
          dragologyOnDrag={() =>
            d.between(
              produceAmb(state, (draft) => {
                draft.points[idx] = Vec2(
                  amb(_.range(state.w)),
                  amb(_.range(state.h)),
                );
                require(uPairs(draft.points).every(([p1, p2]) => !p1.eq(p2)));
              }),
            )
          }
        />
      ))}
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={350}
      height={350}
    />
  ),
  { tags: ["d.between"] },
);
