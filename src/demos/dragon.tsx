import { useMemo, useState } from "react";
import { demo } from "../demo";
import {
  ConfigCheckbox,
  ConfigPanel,
  ConfigSlider,
  DemoDraggable,
  DemoLink,
  DemoNotes,
  DemoWithConfig,
} from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { inOrder } from "../math/optimization";
import { Vec2 } from "../math/vec2";
import { Svgx } from "../svgx";
import { translate } from "../svgx/helpers";

type State = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  squareness: number;
  tilt: number;
};

const initialState: State = {
  from: { x: 300, y: 150 },
  to: { x: 40, y: 60 },
  squareness: 0.4,
  tilt: 0,
};

function makeDraggable(levels: number, tiltEnabled: boolean): Draggable<State> {
  return ({ state, d, draggedId, isTracking }) => {
    function dragon(
      p1: Vec2,
      p2: Vec2,
      dir: number,
      level: number,
      id: string,
    ): Svgx[] {
      if (isTracking && !draggedId?.startsWith(id)) {
        return [];
      }
      if (level == 0) {
        return [
          <line
            id={id}
            transform={translate(p1)}
            {...p2.sub(p1).xy2()}
            stroke="black"
            strokeWidth={4}
            strokeLinecap="round"
            dragologyOnDrag={() =>
              d.vary(
                state,
                [param("squareness"), tiltEnabled && param("tilt")],
                {
                  constraint: (s) => inOrder(-0.8, s.squareness, 0.8),
                },
              )
            }
          />,
        ];
      } else {
        const mid = p1.mid(p2).add(
          p2
            .sub(p1)
            .mul(state.squareness * dir)
            .rotateDeg(90 + state.tilt),
        );
        return [
          ...dragon(p1, mid, -1, level - 1, `${id}-0`),
          ...dragon(mid, p2, 1, level - 1, `${id}-1`),
        ];
      }
    }

    return (
      <g>
        {dragon(Vec2(state.from), Vec2(state.to), -1, levels, "line")}
        <circle
          id="from"
          transform={translate(state.from)}
          r={8}
          fill="red"
          dragologyOnDrag={() =>
            d.vary(state, [param("from", "x"), param("from", "y")])
          }
        />
        <circle
          id="to"
          transform={translate(state.to)}
          r={8}
          fill="blue"
          dragologyOnDrag={() =>
            d.vary(state, [param("to", "x"), param("to", "y")])
          }
        />
      </g>
    );
  };
}

export default demo(
  () => {
    const [levels, setLevels] = useState(9);
    const [tiltEnabled, setTiltEnabled] = useState(true);
    const draggable = useMemo(
      () => makeDraggable(levels, tiltEnabled),
      [levels, tiltEnabled],
    );
    return (
      <div>
        <DemoNotes>
          Adapted from{" "}
          <DemoLink href="https://omrelli.ug/g9/">g9's famous example</DemoLink>
          . Nice performance stress test.
        </DemoNotes>
        <DemoWithConfig>
          <DemoDraggable
            draggable={draggable}
            initialState={initialState}
            width={400}
            height={280}
          />
          <ConfigPanel>
            <ConfigSlider
              label="Levels"
              value={levels}
              onChange={setLevels}
              min={1}
              max={13}
            />
            <ConfigCheckbox
              label="Control tilt with drag"
              value={tiltEnabled}
              onChange={setTiltEnabled}
            />
          </ConfigPanel>
        </DemoWithConfig>
      </div>
    );
  },
  { tags: ["d.vary", "math", "isTracking"] },
);
