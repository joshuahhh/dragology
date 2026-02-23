import { useMemo, useState } from "react";
import { demo } from "../demo";
import { ConfigCheckbox, ConfigPanel, DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = { items: string[] };

const initialState: State = {
  items: ["Apples", "Bananas", "Cherries", "Dates"],
};

const W = 160;
const H = 40;
const GAP = 8;

/**
 * Produce all arrays resulting from taking the item in `arr` at
 * `fromIdx`, removing it from its original position, and reinserting
 * it at every possible position. */
function getAllReinsertions<T>(arr: T[], fromIdx: number): T[][] {
  const result: T[][] = [];
  for (let toIdx = 0; toIdx < arr.length; toIdx++) {
    const newArr = [...arr];
    const item = newArr.splice(fromIdx, 1)[0];
    newArr.splice(toIdx, 0, item);
    result.push(newArr);
  }
  return result;
}

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
            data-z-index={isDragged ? 1 : 0}
            data-on-drag={() => {
              const reinsertions = getAllReinsertions(state.items, i).map(
                (items) => ({ items }),
              );
              let spec = useFloating
                ? d.closest(d.floating(reinsertions))
                : d.between(reinsertions);
              if (useSnapRadius) {
                spec = spec.withSnapRadius(20);
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
      <div className="flex flex-col md:flex-row gap-4 items-start">
        <DemoDraggable
          draggable={draggable}
          initialState={initialState}
          width={220}
          height={230}
        />
        <ConfigPanel>
          <ConfigCheckbox
            label="Use d.floating"
            value={useFloating}
            onChange={setUseFloating}
          />
          <ConfigCheckbox
            label="Use withSnapRadius"
            value={useSnapRadius}
            onChange={setUseSnapRadius}
          />
        </ConfigPanel>
      </div>
    );
  },
  { tags: ["d.between", "d.floating", "reordering", "control"] },
);
