import { produce } from "immer";
import _ from "lodash";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";

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
            d
              .vary(state, [
                param("points", idx, "x"),
                param("points", idx, "y"),
              ])
              .during(
                produce((d) => {
                  d.points[idx] = Vec2(d.points[idx]).clamp(
                    [0, 0],
                    [state.w - 1, state.h - 1],
                  );
                }),
              )
              .onDrop(
                produce((d) => {
                  d.points[idx] = Vec2(d.points[idx]).round();
                }),
              )
              .withSnapRadius(10)
          }
        />
      ))}
    </g>
  );
};

export default demo(
  () => (
    <>
      <DemoNotes>
        Re-implementation of grid-poly in a somewhat more traditional way:
        <ol className="list-decimal pl-5 my-1 space-y-1">
          <li>
            <code>d.vary</code> lets x &amp; y be dragged freely.
          </li>
          <li>
            <code>spec.during</code> keeps the dragged point inside the grid.
          </li>
          <li>
            <code>spec.onDrop</code> rounds the point to the nearest grid point
            on drop.
          </li>
          <li>
            <code>spec.withSnapRadius</code> works on top of all of this – which
            is kinda cool because we never enumerate the drop locations!
          </li>
        </ol>
        But note that we don't stop points from colliding, which grid-poly does.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={350}
        height={350}
      />
    </>
  ),
  { tags: ["d.vary", "spec.during", "spec.onDrop", "spec.withSnapRadius"] },
);
