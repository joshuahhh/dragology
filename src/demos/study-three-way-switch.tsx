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

type State = { name: "r" | "g" | "b" };

const initialState: State = { name: "r" };

const POS = {
  r: { x: 50, y: 20 },
  g: { x: 16, y: 78 },
  b: { x: 84, y: 78 },
};

const COLOR = {
  r: "#ef4444",
  g: "#22c55e",
  b: "#3b82f6",
};

const makeDraggable = (
  useFloating: boolean,
  clockwiseOnly: boolean,
): Draggable<State> => {
  const states = [{ name: "r" }, { name: "g" }, { name: "b" }] as const;
  return ({ state, d }) => (
    <g transform={translate(60, 30)}>
      {/* Target dots */}
      {(["r", "g", "b"] as const).map((name) => (
        <circle
          transform={translate(POS[name].x, POS[name].y)}
          r={16}
          fill={COLOR[name]}
          opacity={0.25}
        />
      ))}

      {/* Draggable knob */}
      <circle
        id="knob"
        transform={translate(POS[state.name].x, POS[state.name].y)}
        r={16}
        fill={COLOR[state.name]}
        stroke="white"
        strokeWidth={3}
        filter="url(#shadow)"
        dragologyOnDrag={() => {
          const spec = clockwiseOnly
            ? (state.name === "r"
                ? d.between([state, { name: "b" }])
                : state.name === "b"
                  ? d.between([state, { name: "g" }])
                  : d.between([state, { name: "r" }])
              ).withSnapRadius(15, { chain: true })
            : d.between(states);
          return useFloating ? spec.withFloating() : spec;
        }}
      />

      {/* Drop-shadow filter */}
      <defs>
        <filter id="shadow" x="-100%" y="-100%" width="300%" height="300%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.2" />
        </filter>
      </defs>
    </g>
  );
};

export default demo(
  () => {
    const [useFloating, setUseFloating] = useState(false);
    const [clockwiseOnly, setClockwiseOnly] = useState(false);
    const draggable = useMemo(
      () => makeDraggable(useFloating, clockwiseOnly),
      [useFloating, clockwiseOnly],
    );
    return (
      <DemoWithConfig>
        <DemoDraggable
          draggable={draggable}
          initialState={initialState}
          width={200}
          height={200}
        />
        <ConfigPanel>
          <ConfigCheckbox
            label="Use withFloating"
            value={useFloating}
            onChange={setUseFloating}
          />
          <ConfigCheckbox
            label="Clockwise drag only (with chaining)"
            value={clockwiseOnly}
            onChange={setClockwiseOnly}
          />
        </ConfigPanel>
      </DemoWithConfig>
    );
  },
  { tags: ["d.between"] },
);
