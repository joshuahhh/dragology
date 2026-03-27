import { useMemo, useState } from "react";
import { demo } from "../demo";
import {
  ConfigPanel,
  ConfigSelect,
  DemoDraggable,
  DemoNotes,
  DemoWithConfig,
} from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = { pos: 0 | 1 | 2 };

const initialState: State = { pos: 0 };

const POSITIONS = [
  [30, 50],
  [130, 50],
  [230, 50],
] as const;

const SIZE = 40;

function makeDraggable(stickiness: number): Draggable<State> {
  return ({ state, d }) => (
    <g>
      {POSITIONS.map((pos, i) => (
        <rect
          key={i}
          transform={translate(pos)}
          width={SIZE}
          height={SIZE}
          rx={6}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth={1}
        />
      ))}
      <rect
        id="dot"
        transform={translate(POSITIONS[state.pos])}
        width={SIZE}
        height={SIZE}
        rx={6}
        dragologyOnDrag={() =>
          d.closest([{ pos: 0 }, { pos: 1 }, { pos: 2 }] as State[], {
            stickiness,
          })
        }
      />
    </g>
  );
}

const STICKINESS_VALUES = [0, 10, 30, 60] as const;

export default demo(
  () => {
    const [stickiness, setStickiness] = useState<number>(0);
    const draggable = useMemo(() => makeDraggable(stickiness), [stickiness]);
    return (
      <>
        <DemoNotes>
          <p>
            Stickiness adds a bias toward the current branch in a{" "}
            <code>closest</code>, making it resist switching until the pointer
            is clearly closer to another option.
          </p>
        </DemoNotes>
        <DemoWithConfig>
          <DemoDraggable
            draggable={draggable}
            initialState={initialState}
            width={320}
            height={140}
          />
          <ConfigPanel>
            <ConfigSelect
              label="Stickiness"
              value={stickiness}
              onChange={setStickiness}
              options={STICKINESS_VALUES}
            />
          </ConfigPanel>
        </DemoWithConfig>
      </>
    );
  },
  { tags: ["d.closest [stickiness]"] },
);
