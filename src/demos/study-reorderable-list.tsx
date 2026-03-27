import { useMemo, useState } from "react";
import { demo } from "../demo";
import {
  ConfigCheckbox,
  ConfigPanel,
  DemoDraggable,
  DemoWithConfig,
} from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = { items: string[] };

const initialState: State = {
  items: ["Apples", "Bananas", "Cherries", "Dates"],
};

const W = 160;
const H = 40;
const GAP = 8;

function makeDraggable(
  useFloating: boolean,
  useSnapRadius: boolean,
): Draggable<State> {
  return ({ state, d, draggedId }) => (
    <g transform={translate(20, 20)}>
      {state.items.map((item, i) => {
        const isDragged = draggedId === item;
        return (
          <g
            id={item}
            transform={translate(0, i * (H + GAP))}
            dragologyZIndex={isDragged ? 1 : 0}
            dragologyOnDrag={() => {
              const newStates = state.items.map((_item, j) => ({
                items: moveItem(state.items, i, j),
              }));
              let spec = useFloating
                ? d.closest(newStates).withFloating()
                : d.between(newStates);
              if (useSnapRadius) {
                spec = spec.withSnapRadius(10);
              }
              return spec;
            }}
          >
            {/* Item background */}
            <rect
              width={W}
              height={H}
              rx={6}
              fill="white"
              stroke="#d1d5db"
              strokeWidth={1.5}
            />

            {/* Item text */}
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
        );
      })}
    </g>
  );
}

export default demo(
  () => {
    const [useFloating, setUseFloating] = useState(false);
    const [useSnapRadius, setUseSnapRadius] = useState(false);
    const draggable = useMemo(
      () => makeDraggable(useFloating, useSnapRadius),
      [useFloating, useSnapRadius],
    );
    return (
      <DemoWithConfig>
        <DemoDraggable
          draggable={draggable}
          initialState={initialState}
          width={220}
          height={230}
        />
        <ConfigPanel>
          <ConfigCheckbox
            label="Use d.closest with floating"
            value={useFloating}
            onChange={setUseFloating}
          />
          <ConfigCheckbox
            label="Use withSnapRadius"
            value={useSnapRadius}
            onChange={setUseSnapRadius}
          />
        </ConfigPanel>
      </DemoWithConfig>
    );
  },
  {
    tags: [
      "d.between",
      "d.closest",
      "spec.withFloating",
      "spec.withSnapRadius",
      "reordering",
    ],
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
