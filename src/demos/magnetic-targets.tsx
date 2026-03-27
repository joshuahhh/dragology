import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = { current: number };

const targets = [
  { x: 90, y: 140, strength: 0.6, color: "#95a5a6" },
  { x: 210, y: 55, strength: 1, color: "#c0392b" },
  { x: 350, y: 140, strength: 2.5, color: "#2980b9" },
];

const initialState: State = { current: 1 };

const TARGET_R = 18;
const HALO_BASE = 55;

const draggable: Draggable<State> = ({ state, d }) => {
  const cur = targets[state.current];

  return (
    <g>
      {targets.map((t, i) => (
        <g id={`target-${i}`} transform={translate(t.x, t.y)}>
          <circle r={HALO_BASE / t.strength} fill={t.color} opacity={0.06} />
          <circle
            r={HALO_BASE / t.strength}
            fill="none"
            stroke={t.color}
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.35}
          />
          <circle r={TARGET_R} fill={t.color} opacity={0.6} />
          <text y={TARGET_R + 14} textAnchor="middle" fontSize={11} fill="#555">
            ×{t.strength}
          </text>
        </g>
      ))}
      <circle
        id="puck"
        transform={translate(cur.x, cur.y)}
        r={12}
        fill="#333"
        stroke="white"
        strokeWidth={2}
        dragologyZIndex={2}
        dragologyOnDrag={() =>
          d.closest(
            targets.map((t, i) =>
              d.fixed({ current: i }).changeGap((dist) => dist * t.strength),
            ),
          )
        }
      />
    </g>
  );
};

export default demo(
  () => (
    <div>
      <DemoNotes>
        <span className="font-mono">changeGap</span> reweights gaps going into a{" "}
        <span className="font-mono">d.closest</span>, resulting in some funny
        drop zones. (Take a look with the "Drop zones" viewer!)
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={420}
        height={300}
      />
    </div>
  ),
  { tags: ["d.closest", "d.fixed", "spec.changeGap"] },
);
