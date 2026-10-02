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
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";

// `at` is null at the hub, or the index of a leaf
type State = { at: number | null };

const initialState: State = { at: null };

const HUB = Vec2(150, 130);
const SPOKE_LENGTH = 110;
// Some spokes close together, where it's easy to stray onto a neighbor
const ANGLES = [0, 30, 60, 150, 240];
const LEAVES = ANGLES.map((deg) =>
  HUB.add(Vec2(SPOKE_LENGTH, 0).rotateDeg(deg)),
);

function makeDraggable(lockPast: number | undefined): Draggable<State> {
  return ({ state, d }) => (
    <g>
      {LEAVES.map((leaf) => (
        <g>
          <line
            {...HUB.xy1()}
            {...leaf.xy2()}
            stroke="#cbd5e1"
            strokeWidth={2}
          />
          <circle
            transform={translate(leaf)}
            r={14}
            fill="none"
            stroke="#cbd5e1"
          />
        </g>
      ))}
      <circle transform={translate(HUB)} r={14} fill="none" stroke="#cbd5e1" />
      <circle
        id="dot"
        transform={translate(state.at === null ? HUB : LEAVES[state.at])}
        r={12}
        fill="#3b82f6"
        dragologyOnDrag={() =>
          state.at === null
            ? d
                .closest(
                  LEAVES.map((_, i) => d.between([state, { at: i }])),
                  { lockPast },
                )
                .withChaining()
            : d.between([state, { at: null }]).withChaining()
        }
      />
    </g>
  );
}

const LOCK_PAST_VALUES = [undefined, 10, 20, 30] as const;

export default demo(
  () => {
    const [lockPast, setLockPast] = useState<number | undefined>(20);
    const draggable = useMemo(() => makeDraggable(lockPast), [lockPast]);
    return (
      <>
        <DemoNotes>
          <p>
            A <code>closest</code> of <code>between</code>s, one per spoke.
            Without <code>lockPast</code>, a drag partway out one spoke can jump
            onto a neighboring spoke. With it, once the dot is more than{" "}
            <code>lockPast</code> pixels from the hub, it stays on its spoke
            until it comes back.
          </p>
        </DemoNotes>
        <DemoWithConfig>
          <DemoDraggable
            draggable={draggable}
            initialState={initialState}
            width={300}
            height={260}
          />
          <ConfigPanel>
            <ConfigSelect
              label="lockPast"
              value={lockPast}
              onChange={setLockPast}
              options={LOCK_PAST_VALUES}
              stringifyOption={(v) => (v === undefined ? "off" : String(v))}
            />
          </ConfigPanel>
        </DemoWithConfig>
      </>
    );
  },
  { tags: ["d.closest [lockPast]", "d.between"] },
);
