import _ from "lodash";
import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { lessThan, param } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";

type State = {
  x: number;
  y: number;
};

const center = Vec2(150, 150);

// Regular pentagon vertices
const sides = 5;
const polyRadius = 100;
const vertices = _.range(sides).map((i) =>
  center.add(Vec2.polarDeg(polyRadius, (i * 360) / sides - 90)),
);

const initialState: State = {
  x: center.x,
  y: center.y,
};

// For a convex polygon, point-in-polygon = on the inside of every edge.
// For edge from A to B, the inward half-plane is: cross(B - A, P - A) >= 0.
function polygonConstraint(s: State) {
  return vertices.map((a, i) => {
    const b = vertices[(i + 1) % vertices.length];
    return lessThan(0, b.sub(a).cross(Vec2(s).sub(a)));
  });
}

const pointsStr = vertices.map((v) => v.str()).join(" ");

const draggable: Draggable<State> = ({ state, d }) => {
  return (
    <g>
      {/* boundary polygon */}
      <polygon
        points={pointsStr}
        fill="none"
        stroke="#ccc"
        strokeWidth={2}
        strokeDasharray="6 4"
      />
      {/* draggable point */}
      <circle
        id="point"
        transform={translate(state)}
        r={14}
        fill="black"
        dragologyOnDrag={() =>
          d.vary(state, [param("x"), param("y")], {
            constraint: polygonConstraint,
          })
        }
      />
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={300}
      height={300}
    />
  ),
  { tags: ["d.vary [constraint]"] },
);
