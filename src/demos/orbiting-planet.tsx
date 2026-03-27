import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";

import { demo } from "../demo";
import { translate } from "../svgx/helpers";

// A planet that can orbit around different stars.

const STARS = [
  { x: 100, y: 150, color: "#e8b730", label: "A" },
  { x: 300, y: 100, color: "#e05050", label: "B" },
  { x: 250, y: 280, color: "#4080e0", label: "C" },
];

const ORBIT_RADIUS = 60;
const STAR_RADIUS = 14;
const PLANET_RADIUS = 8;

type State = {
  currentStar: number;
  angle: number;
};

const initialState: State = {
  currentStar: 0,
  angle: 0,
};

const draggable: Draggable<State> = ({ state, d }) => {
  const star = STARS[state.currentStar];
  const planetX = star.x + ORBIT_RADIUS * Math.cos(state.angle);
  const planetY = star.y + ORBIT_RADIUS * Math.sin(state.angle);

  return (
    <g>
      {/* Orbit circles */}
      {STARS.map((s) => (
        <circle
          cx={s.x}
          cy={s.y}
          r={ORBIT_RADIUS}
          fill="none"
          stroke="#c0c0c0"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      ))}

      {/* Stars */}
      {STARS.map((s) => (
        <g transform={translate(s.x, s.y)}>
          <circle r={STAR_RADIUS} fill={s.color} />
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={12}
            fontWeight="bold"
            fill="white"
          >
            {s.label}
          </text>
        </g>
      ))}

      {/* Planet */}
      <g
        id="planet"
        transform={translate(planetX, planetY)}
        dragologyZIndex={1}
        dragologyOnDrag={() =>
          d.closest(
            STARS.map((_, starIdx) =>
              d.vary(
                { currentStar: starIdx, angle: state.angle },
                param("angle"),
              ),
            ),
          )
        }
      >
        <circle r={PLANET_RADIUS} fill="#333" stroke="#666" strokeWidth={1} />
      </g>
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={450}
      height={400}
    />
  ),
  { tags: ["d.vary", "d.closest", "multiple continuous targets"] },
);
