import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";

type Corner = "A" | "B" | "C";

type State = { corner: Corner };

const initialState: State = { corner: "A" };

const CORNERS: Record<Corner, Vec2> = {
  A: Vec2(50, 50),
  B: Vec2(250, 50),
  C: Vec2(150, 220),
};

// Outside the triangle, away from its center.
const LABEL_OFFSETS: Record<Corner, Vec2> = {
  A: Vec2(-30, -24),
  B: Vec2(30, -24),
  C: Vec2(0, 36),
};

const draggable: Draggable<State> = ({ state, d }) => (
  <g>
    <path
      d={`M ${CORNERS.A.x} ${CORNERS.A.y} L ${CORNERS.B.x} ${CORNERS.B.y} L ${CORNERS.C.x} ${CORNERS.C.y} Z`}
      fill="none"
      stroke="#cbd5e1"
      strokeWidth={2}
    />
    {(Object.keys(CORNERS) as Corner[]).map((corner) => (
      <g transform={translate(CORNERS[corner])}>
        <circle r={22} fill="none" stroke="#cbd5e1" strokeDasharray="4 3" />
        <text
          transform={translate(LABEL_OFFSETS[corner])}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={16}
          fill="#64748b"
        >
          {corner}
        </text>
      </g>
    ))}
    <g
      id="mark"
      transform={translate(CORNERS[state.corner])}
      dragologyOnDrag={() =>
        d.between([{ corner: "A" }, { corner: "B" }, { corner: "C" }])
      }
    >
      <circle r={18} fill="#3b82f6" />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={18}
        fontWeight="bold"
        fill="white"
      >
        {state.corner}
      </text>
    </g>
  </g>
);

export default demo(
  () => (
    <div>
      <DemoNotes>
        <p>
          Drag the mark around the triangle. Its position blends between the
          corners, but its label is text, which can't be blended, so it shows
          the nearest corner's letter.
        </p>
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={300}
        height={270}
      />
    </div>
  ),
  { tags: ["d.between"] },
);
