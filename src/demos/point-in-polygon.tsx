import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { lessThan } from "../DragSpec";
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
const vertices = Array.from({ length: sides }, (_, i) => {
  const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
  return Vec2(
    center.x + polyRadius * Math.cos(angle),
    center.y + polyRadius * Math.sin(angle),
  );
});

const initialState: State = {
  x: center.x,
  y: center.y,
};

// For a convex polygon, point-in-polygon = on the inside of every edge.
// For edge from A to B, the inward half-plane is: cross(B - A, P - A) >= 0
// i.e. lessThan(0, cross(B - A, P - A)) or equivalently lessThan(-cross(...), 0)
function polygonConstraint(s: { x: number; y: number }): number[] {
  return vertices.map((a, i) => {
    const b = vertices[(i + 1) % vertices.length];
    const edgeX = b.x - a.x;
    const edgeY = b.y - a.y;
    const toPointX = s.x - a.x;
    const toPointY = s.y - a.y;
    const cross = edgeX * toPointY - edgeY * toPointX;
    // cross >= 0 means inside; lessThan(-cross, 0) means -cross <= 0
    return lessThan(-cross, 0);
  });
}

const pointsStr = vertices.map((v) => `${v.x},${v.y}`).join(" ");

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
        transform={translate(Vec2(state.x, state.y))}
        r={14}
        fill="black"
        dragology={() =>
          d.vary(state, [["x"], ["y"]], {
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
  { tags: ["d.vary [w/constraint]"] },
);
