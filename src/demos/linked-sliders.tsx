import { produce } from "immer";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { inOrder } from "../DragSpec";
import { translate } from "../svgx/helpers";

type State = { values: number[] };

const N = 5;
const W = 240;
const H = 6;
const R = 10;
const SPACING = 36;
const X0 = 40;
const Y0 = 30;

export const initialState: State = {
  values: Array.from({ length: N }, (_, i) => ((i + 1) / (N + 1)) * W),
};

const draggable: Draggable<State> = ({ state, d }) => (
  <g>
    {state.values.map((value, i) => (
      <g transform={translate(X0, Y0 + i * SPACING)}>
        {/* Track */}
        <rect width={W} height={H} rx={H / 2} fill="#e5e7eb" y={-H / 2} />

        {/* Filled portion */}
        <rect width={value} height={H} rx={H / 2} fill="#3b82f6" y={-H / 2} />

        {/* Thumb */}
        <circle
          transform={translate(value, 0)}
          r={R}
          fill="white"
          stroke="#d1d5db"
          strokeWidth={1.5}
          filter="url(#slider-shadow)"
          dragologyOnDrag={() => {
            return d.varyFunc(
              [0],
              ([delta]) =>
                produce(state, (s) => {
                  for (let j = i; j < N; j++) {
                    s.values[j] += delta;
                  }
                }),
              { constraint: (s) => s.values.map((v) => inOrder([0, v, W])) },
            );
          }}
        />

        {/* Label */}
        <text
          x={-10}
          textAnchor="end"
          fontSize={11}
          fontFamily="system-ui, sans-serif"
          fill="#9ca3af"
          dominantBaseline="central"
        >
          {i + 1}
        </text>

        {/* Value readout */}
        <text
          transform={translate(W + 12, 0)}
          fontSize={11}
          fontFamily="system-ui, sans-serif"
          fill="#374151"
          dominantBaseline="central"
        >
          {Math.round(value)}
        </text>
      </g>
    ))}

    <defs>
      <filter id="slider-shadow" x="-100%" y="-100%" width="300%" height="300%">
        <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
      </filter>
    </defs>
  </g>
);

export default demo(
  () => (
    <>
      <DemoNotes>
        Contrived demo of <code>d.varyFunc</code>: each slider controls itself &
        all lower sliders. They're constrained to the tracks.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={340}
        height={Y0 + (N - 1) * SPACING + 30}
      />
    </>
  ),
  { tags: ["d.varyFunc"] },
);
