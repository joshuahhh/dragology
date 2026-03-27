import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = { items: string[] };

const initialState: State = {
  items: ["Apples", "Bananas", "Cherries", "Dates"],
};

const W = 160;
const H = 40;
const GAP = 8;

const draggable: Draggable<State> = ({ state, d }) => (
  <g transform={translate(20, 20)}>
    {state.items.map((item, i) => (
      <g
        transform={translate(0, i * (H + GAP))}
        dragologyOnDrag={() => {
          const newStates = state.items.map((_item, j) => ({
            items: moveItem(state.items, i, j),
          }));
          return d.between(newStates);
        }}
      >
        <rect
          width={W}
          height={H}
          rx={6}
          fill="white"
          stroke="#d1d5db"
          strokeWidth={1.5}
        />
        <text
          x={W / 2}
          y={H / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={16}
          fill="#374151"
        >
          {item}
        </text>
      </g>
    ))}
  </g>
);

export default demo(
  () => (
    <div>
      <DemoNotes>
        This tests the "coincident targets detected" error (because{" "}
        <code>id</code> is missing).
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={220}
        height={230}
      />
    </div>
  ),
  {
    tags: ["error"],
    hideByDefault: true,
  },
);

/**
 * Produce a new array from `arr` by removing the item at `fromIdx`
 * and inserting it at `toIdx`.
 */
// @ts-ignore unused
function moveItem<T>(arr: T[], fromIdx: number, toIdx: number): T[] {
  const newArr = [...arr];
  const item = newArr.splice(fromIdx, 1)[0];
  newArr.splice(toIdx, 0, item);
  return newArr;
}
