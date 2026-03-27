import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { translate } from "../svgx/helpers";

type State =
  | { type: "on-island"; island: "A" | "B" }
  | { type: "floating"; x: number; y: number };

const islands = {
  A: { x: 100, y: 150 },
  B: { x: 300, y: 150 },
} as const;
const R_SMALL = 10;
const R_BIG = 20;

const initialState: State = { type: "on-island", island: "A" };

const draggable: Draggable<State> = ({ state, d }) => (
  <g>
    {(["A", "B"] as const).map((id) => {
      const radius =
        state.type === "on-island" && state.island === id ? R_BIG : R_SMALL;
      return (
        <g key={id} transform={translate(islands[id].x, islands[id].y)}>
          <circle r={radius} fill="none" stroke="#ccc" strokeWidth={2} />
          <text y={radius + 16} textAnchor="middle" fill="#aaa" fontSize={12}>
            {id}
          </text>
        </g>
      );
    })}
    <circle
      id="dot"
      r={10}
      fill="#4488ff"
      transform={translate(
        state.type === "on-island" ? islands[state.island] : state,
      )}
      dragologyOnDrag={() =>
        d
          .closest([
            { type: "on-island", island: "A" },
            { type: "on-island", island: "B" },
          ])
          .withFloating()
          .whenFar(
            d.vary({ type: "floating", x: 0, y: 0 }, [param("x"), param("y")]),
          )
      }
    />
  </g>
);

export default demo(
  () => (
    <>
      <DemoNotes>
        The (second) simplest possible demonstration of "discrete islands in a
        continuous sea", aka <code>spec.whenFar(d.vary(...))</code>. Once used
        to test some misbehaving float positioning.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={400}
        height={300}
      />
    </>
  ),
  { tags: ["d.closest", "d.vary", "spec.whenFar", "spec.withFloating"] },
);
