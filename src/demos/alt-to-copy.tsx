import { demo } from "../demo";
import { DemoDraggable, DemoLink, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { altKey } from "../modifierKeys";
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
          const moveDot = (s: State, dotId: string) =>
            d.vary(s, [param("dots", dotId, "x"), param("dots", dotId, "y")]);

          return d.reactTo(altKey, (altKey) => {
            if (altKey) {
              // Copy: add a new dot at the same position, follow the copy
              const copyId = makeId();
              const newDot = {
                ...dot,
                color: colors[Object.keys(state.dots).length % colors.length],
              };
              const newState: State = {
                dots: { ...state.dots, [copyId]: newDot },
              };
              return d.switchToStateAndFollow(
                newState,
                `dot-${copyId}`,
                moveDot(newState, copyId),
              );
            } else {
              // Move: vary this dot's position
              return moveDot(state, id);
            }
          });
        }}
      />
    ))}
  </g>
);

export default demo(
  () => (
    <>
      <DemoNotes>
        Hold <b>Alt/Option</b> while dragging to duplicate a dot. You can toggle
        Alt mid-drag. (Test out our{" "}
        <DemoLink href="https://tldraw.dev/blog/adding-delays-to-modifier-keys">
          release timeout
        </DemoLink>
        !)
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={400}
        height={300}
      />
    </>
  ),
  {
    tags: [
      "d.switchToStateAndFollow",
      "d.vary",
      "keyboard",
      "copying",
      "setState",
    ],
  },
);
