import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { equal, param } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";

type State = {
  x: number;
  y: number;
};

const center = Vec2(150, 150);
const radius = 100;

const initialState: State = center.add(Vec2(radius, 0));

const draggable: Draggable<State> = ({ state, d }) => {
  return (
    <g>
      <circle
        {...center.cxy()}
        r={radius}
        fill="none"
        stroke="#ccc"
        strokeWidth={2}
        strokeDasharray="6 4"
      />
      <circle
        id="point"
        transform={translate(state)}
        r={14}
        fill="black"
        dragologyOnDrag={() =>
          d.vary(state, [param("x"), param("y")], {
            constraint: (s) => equal(center.dist2(s), radius ** 2),
          })
        }
      />
    </g>
  );
};

export default demo(
  () => (
    <>
      <DemoNotes>
        This demo parameterizes a point's position using x and y coordinates and
        then constrains it to be on the circle using an <code>equal</code>{" "}
        constraint. (You could alternatively parameterize it with an angle, in
        which case you wouldn't need constraints)
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={300}
        height={300}
      />
    </>
  ),
  { tags: ["d.vary [constraint]"] },
);
