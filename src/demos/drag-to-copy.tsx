import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { translate } from "../svgx/helpers";
import { makeId } from "../utils";

type Dot = { x: number; y: number; color: string };
type State = { dots: Record<string, Dot> };

const DOT_RADIUS = 20;
const colors = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#ec4899",
];

const id0 = makeId();
const initialState: State = {
  dots: { [id0]: { x: 150, y: 100, color: colors[0] } },
};

const draggable: Draggable<State> = ({ state, d, setState }) => (
  <g>
    {Object.entries(state.dots).map(([id, dot]) => (
      <circle
        id={`dot-${id}`}
        transform={translate(dot.x, dot.y)}
        r={DOT_RADIUS}
        fill={dot.color}
        onDoubleClick={() => {
          const { [id]: _, ...rest } = state.dots;
          setState({ dots: rest });
        }}
        dragologyOnDrag={() => {
          const copyId = makeId();
          const newState: State = {
            dots: {
              ...state.dots,
              [copyId]: {
                ...dot,
                color: colors[Object.keys(state.dots).length % colors.length],
              },
            },
          };
          return d.switchToStateAndFollow(
            newState,
            `dot-${copyId}`,
            d.vary(newState, [
              param("dots", copyId, "x"),
              param("dots", copyId, "y"),
            ]),
          );
        }}
      />
    ))}
  </g>
);

export default demo(
  () => (
    <>
      <DemoNotes>Drag to duplicate. Double click to remove.</DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={400}
        height={300}
      />
    </>
  ),
  { tags: ["d.switchToStateAndFollow", "d.vary", "setState", "copying"] },
);
